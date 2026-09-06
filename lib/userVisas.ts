import * as Crypto from 'expo-crypto';
import { getDatabase } from './database';
import { rescheduleVisaExpiryReminders } from './notifications';

export type EntriesAllowed = 'single' | 'multiple';

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
}

// ─── Cloud sync support ─────────────────────────────────────────────────────

/** Every row including tombstones, so deletions propagate to other devices. */
export async function getAllUserVisasForSync(): Promise<UserVisa[]> {
  const db = await getDatabase();
  return db.getAllAsync<UserVisa>(`SELECT * FROM user_visas ORDER BY id ASC`);
}

export async function setUserVisaSyncId(id: number, syncId: string): Promise<void> {
  const db = await getDatabase();
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
}): Promise<void> {
  const db = await getDatabase();

  const existing = await db.getFirstAsync<UserVisa>(
    `SELECT * FROM user_visas WHERE sync_id = ?`,
    [visa.sync_id],
  );

  if (existing) {
    if (existing.updated_at && existing.updated_at >= visa.updated_at) return;
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
    await db.runAsync(
      `INSERT INTO user_visas
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
