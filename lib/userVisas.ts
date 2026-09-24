import * as Crypto from 'expo-crypto';
import { getDatabase, isFromThisInstall } from './database';
import { localIsNewer } from './syncTime';
import { timelineChanged } from './syncTrigger';
import { rescheduleVisaExpiryReminders } from './notifications';

export type EntriesAllowed = 'single' | 'multiple';

/**
 * `valid_to` for a visa that has no expiry date.
 *
 * A visa on arrival is issued when you land: there is no document with a date
 * on it, only an allowance per entry. The column is NOT NULL, so "never" is
 * spelled as a date far enough out that no comparison mistakes it for real.
 * Expiry reminders are skipped for these, and `hasNoExpiry` is how every
 * caller asks, so the sentinel never leaks into the UI.
 */
export const NO_EXPIRY = '9999-12-31';

export function hasNoExpiry(validTo: string): boolean {
  return validTo === NO_EXPIRY;
}

/**
 * A visa the user has manually entered (e.g. "US B1/B2", "Spain Digital Nomad",
 * "Schengen Type-D"). While an active user-visa exists for a country, it
 * overrides the citizenship-aware default rule in constants/visaPolicies.ts.
 *
 * Day-cap rules:
 *   - `max_days_per_window` + `window_days` → rolling window (e.g. 90/180)
 *   - `max_days_per_stay`                   → per-stay cap, resets on exit
 *   - both null                             → no day tracking (just an expiry reminder)
 *
 * Rows carry `sync_id` / `updated_at` / `deleted` and are mirrored to
 * `users/<uid>/visas` by lib/sync.ts. These are hand-typed records that exist
 * nowhere else: losing them on a device change would mean re-entering every
 * expiry date by hand.
 */
export interface UserVisa {
  id: number;
  country_code: string;
  label: string;
  valid_from: string;
  valid_to: string;
  max_days_per_stay: number | null;
  max_days_per_window: number | null;
  window_days: number | null;
  entries_allowed: EntriesAllowed;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  sync_id: string | null;
  deleted: number;
}

export interface UserVisaInput {
  country_code: string;
  label: string;
  valid_from: string;
  valid_to: string;
  max_days_per_stay?: number | null;
  max_days_per_window?: number | null;
  window_days?: number | null;
  entries_allowed?: EntriesAllowed;
  notes?: string | null;
}

/**
 * Timestamps are written as ISO-8601 UTC rather than SQLite's `datetime('now')`.
 * Last-write-wins compares the local value against one rebuilt from a Firestore
 * Timestamp, and the two only order correctly if they are the same shape.
 */
function nowIso(): string {
  return new Date().toISOString();
}

export async function insertUserVisa(input: UserVisaInput): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO user_visas
      (country_code, label, valid_from, valid_to,
       max_days_per_stay, max_days_per_window, window_days,
       entries_allowed, notes, sync_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.country_code,
      input.label,
      input.valid_from,
      input.valid_to,
      input.max_days_per_stay ?? null,
      input.max_days_per_window ?? null,
      input.window_days ?? null,
      input.entries_allowed ?? 'multiple',
      input.notes ?? null,
      Crypto.randomUUID(),
      nowIso(),
    ],
  );
  // Re-schedule expiry reminders so the newly-added visa gets its 30/7/1-day
  // countdowns set up. Fire-and-forget: the insert succeeded either way.
  syncExpiryReminders();
  timelineChanged();
  return result.lastInsertRowId;
}

export async function updateUserVisa(id: number, input: UserVisaInput): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE user_visas SET
       country_code = ?, label = ?, valid_from = ?, valid_to = ?,
       max_days_per_stay = ?, max_days_per_window = ?, window_days = ?,
       entries_allowed = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.country_code,
      input.label,
      input.valid_from,
      input.valid_to,
      input.max_days_per_stay ?? null,
      input.max_days_per_window ?? null,
      input.window_days ?? null,
      input.entries_allowed ?? 'multiple',
      input.notes ?? null,
      nowIso(),
      id,
    ],
  );
  syncExpiryReminders();
  timelineChanged();
}

export async function getAllUserVisas(): Promise<UserVisa[]> {
  const db = await getDatabase();
  return db.getAllAsync<UserVisa>(
    `SELECT * FROM user_visas WHERE deleted = 0 ORDER BY valid_to ASC, id ASC`,
  );
}

export async function getUserVisaById(id: number): Promise<UserVisa | null> {
  const db = await getDatabase();
  return db.getFirstAsync<UserVisa>(
    `SELECT * FROM user_visas WHERE id = ? AND deleted = 0`,
    [id],
  );
}

export async function markUserVisaDeleted(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE user_visas SET deleted = 1, updated_at = ? WHERE id = ?`,
    [nowIso(), id],
  );
  syncExpiryReminders();
  timelineChanged();
}

// ─── Cloud sync support ─────────────────────────────────────────────────────

/** Every row including tombstones, so deletions propagate to other devices. */
export async function getAllUserVisasForSync(): Promise<UserVisa[]> {
  const db = await getDatabase();
  return db.getAllAsync<UserVisa>(`SELECT * FROM user_visas ORDER BY id ASC`);
}

/**
 * Remember which cloud document a visa is, after the push created it. Same
 * hazard as trips (see setSyncId in database.ts): the pull can already have
 * inserted a row for that very document, and claiming the id anyway threw
 * on the unique index and took the sync down with it.
 */
export async function setUserVisaSyncId(id: number, syncId: string): Promise<void> {
  const db = await getDatabase();
  const taken = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM user_visas WHERE sync_id = ? AND id != ?',
    [syncId, id],
  );
  if (taken) {
    await db.runAsync('DELETE FROM user_visas WHERE id = ? AND sync_id IS NULL', [id]);
    return;
  }
  await db.runAsync(`UPDATE user_visas SET sync_id = ? WHERE id = ?`, [syncId, id]);
}

/** Last-write-wins merge of one cloud document into the local table. */
export async function upsertUserVisaFromCloud(visa: {
  sync_id: string;
  country_code: string;
  label: string;
  valid_from: string;
  valid_to: string;
  max_days_per_stay: number | null;
  max_days_per_window: number | null;
  window_days: number | null;
  entries_allowed: EntriesAllowed;
  notes: string | null;
  updated_at: string;
  deleted: boolean;
  local_id?: number | null;
  install_id?: string | null;
}): Promise<void> {
  const db = await getDatabase();

  const existing = await db.getFirstAsync<UserVisa>(
    `SELECT * FROM user_visas WHERE sync_id = ?`,
    [visa.sync_id],
  );

  if (existing) {
    if (localIsNewer(existing.updated_at, visa.updated_at)) return;
    if (visa.deleted) {
      await db.runAsync(`DELETE FROM user_visas WHERE sync_id = ?`, [visa.sync_id]);
    } else {
      await db.runAsync(
        `UPDATE user_visas SET
           country_code = ?, label = ?, valid_from = ?, valid_to = ?,
           max_days_per_stay = ?, max_days_per_window = ?, window_days = ?,
           entries_allowed = ?, notes = ?, updated_at = ?, deleted = 0
         WHERE sync_id = ?`,
        [
          visa.country_code, visa.label, visa.valid_from, visa.valid_to,
          visa.max_days_per_stay, visa.max_days_per_window, visa.window_days,
          visa.entries_allowed, visa.notes, visa.updated_at, visa.sync_id,
        ],
      );
    }
  } else if (!visa.deleted) {
    // This phone's own row coming back before the push stored the id on it.
    // Only from this install: another device's row numbers mean nothing here.
    const adopted = visa.local_id && (await isFromThisInstall(visa.install_id))
      ? await db.runAsync(
          `UPDATE user_visas SET sync_id = ?, country_code = ?, label = ?, valid_from = ?, valid_to = ?,
             max_days_per_stay = ?, max_days_per_window = ?, window_days = ?, entries_allowed = ?,
             notes = ?, updated_at = ?, deleted = 0
           WHERE id = ? AND sync_id IS NULL`,
          [
            visa.sync_id, visa.country_code, visa.label, visa.valid_from, visa.valid_to,
            visa.max_days_per_stay, visa.max_days_per_window, visa.window_days,
            visa.entries_allowed, visa.notes, visa.updated_at, visa.local_id,
          ],
        )
      : null;
    if (adopted && adopted.changes > 0) return;

    await db.runAsync(
      // OR IGNORE for the same reason as trips: the unique index on sync_id
      // makes a concurrent second insert of one document a no-op.
      `INSERT OR IGNORE INTO user_visas
        (country_code, label, valid_from, valid_to,
         max_days_per_stay, max_days_per_window, window_days,
         entries_allowed, notes, sync_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        visa.country_code, visa.label, visa.valid_from, visa.valid_to,
        visa.max_days_per_stay, visa.max_days_per_window, visa.window_days,
        visa.entries_allowed, visa.notes, visa.sync_id, visa.updated_at,
      ],
    );
  }
}

/**
 * Refresh the OS-level visa expiry reminders to match the current set of
 * active user-visas. Fire-and-forget; failures are non-fatal (the data write
 * already succeeded).
 */
function syncExpiryReminders(): void {
  getAllUserVisas()
    .then((all) => rescheduleVisaExpiryReminders(all))
    .catch((err) => console.warn('Failed to reschedule visa expiry reminders:', err));
}
