import { getDatabase } from './database';

export type EntriesAllowed = 'single' | 'multiple';

/**
 * A visa the user has manually entered (e.g. "US B1/B2", "Spain Digital Nomad",
 * "Schengen Type-D"). When an active user-visa exists for a country, it
 * overrides the citizenship-aware default rule in constants/visaPolicies.ts.
 *
 * Day-cap rules:
 *   - `max_days_per_window` + `window_days` → rolling window (e.g. 90/180)
 *   - `max_days_per_stay`                   → per-stay cap, resets on exit
 *   - both null                             → no day tracking (just an expiry reminder)
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

export async function insertUserVisa(input: UserVisaInput): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO user_visas
      (country_code, label, valid_from, valid_to,
       max_days_per_stay, max_days_per_window, window_days,
       entries_allowed, notes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
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
    ],
  );
  return result.lastInsertRowId;
}

export async function updateUserVisa(id: number, input: UserVisaInput): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE user_visas SET
       country_code = ?, label = ?, valid_from = ?, valid_to = ?,
       max_days_per_stay = ?, max_days_per_window = ?, window_days = ?,
       entries_allowed = ?, notes = ?, updated_at = datetime('now')
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
      id,
    ],
  );
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

/**
 * Returns the active (non-expired, non-deleted) user visa for a country.
 * If multiple exist, picks the one with the latest valid_to.
 */
export async function getActiveUserVisaForCountry(
  countryCode: string,
  refDate: Date = new Date(),
): Promise<UserVisa | null> {
  const db = await getDatabase();
  const ymd = refDate.toISOString().slice(0, 10);
  return db.getFirstAsync<UserVisa>(
    `SELECT * FROM user_visas
     WHERE country_code = ? AND deleted = 0
       AND valid_from <= ? AND valid_to >= ?
     ORDER BY valid_to DESC
     LIMIT 1`,
    [countryCode, ymd, ymd],
  );
}

export async function markUserVisaDeleted(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE user_visas SET deleted = 1, updated_at = datetime('now') WHERE id = ?`,
    [id],
  );
}
