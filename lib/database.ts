import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { localIsNewer } from './syncTime';
import { chainDates, countDays, toYmd } from './days';
import { localChanged, timelineChanged } from './syncTrigger';
import { getCountryName } from '../utils/geography';

// ─── Stats Queries ───

import type { Stats } from './stats';

let db: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Open the database, running migrations once.
 *
 * The in-flight promise is memoised, not just the finished handle. Callers
 * arrive in parallel (`prefetchAll` alone fires getAllTrips, getStats and
 * getAllJourneys through Promise.all), and each `await` yields before `db` is
 * assigned. Guarding on the handle alone let all three past the check, so all
 * three ran `migrate()` at once: they read `PRAGMA table_info(trips)` before
 * any of them had added a column, then each issued the same ALTER TABLE and
 * two failed with "duplicate column name: sync_id".
 *
 * That happened on every fresh install, where the ALTERs actually have work to
 * do, and left the first launch with an empty prefetch cache.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (!opening) {
    opening = (async () => {
      const database = await SQLite.openDatabaseAsync('nomad.db');
      await migrate(database);
      db = database;
      return database;
    })().catch((err) => {
      // Let the next caller retry instead of being stuck on a rejected promise.
      opening = null;
      throw err;
    });
  }
  return opening;
}

/**
 * Bump when `migrate` gains a step. Every step is written to be safe to run
 * again, but running all of them (table checks, duplicate clean-ups, a pass
 * over every journey's stops) on each launch, background location wakes
 * included, was work before the first screen for nothing.
 */
const SCHEMA_VERSION = 3;

async function migrate(database: SQLite.SQLiteDatabase): Promise<void> {
  // Per connection, so on every open.
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);
  const version = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((version?.user_version ?? 0) >= SCHEMA_VERSION) return;

  await database.execAsync(`

    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      city TEXT,
      country TEXT,
      country_code TEXT,
      arrived_at TEXT NOT NULL,
      departed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city TEXT NOT NULL,
      country TEXT NOT NULL,
      country_code TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      days INTEGER DEFAULT 1
    );
  `);

  // Plans table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS plans (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      city         TEXT NOT NULL,
      country      TEXT NOT NULL,
      country_code TEXT NOT NULL,
      latitude     REAL,
      longitude    REAL,
      start_date   TEXT NOT NULL,
      end_date     TEXT NOT NULL,
      transport    TEXT NOT NULL DEFAULT 'flight',
      notes        TEXT,
      created_at   TEXT DEFAULT (datetime('now')),
      updated_at   TEXT DEFAULT (datetime('now'))
    );
  `);

  // Journey tables
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS journeys (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS journey_legs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      journey_id   INTEGER NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
      city         TEXT NOT NULL,
      country      TEXT NOT NULL,
      country_code TEXT NOT NULL,
      latitude     REAL,
      longitude    REAL,
      start_date   TEXT NOT NULL,
      end_date     TEXT NOT NULL,
      transport    TEXT NOT NULL DEFAULT 'flight',
      notes        TEXT,
      sort_order   INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS journey_travellers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      journey_id INTEGER NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS journey_documents (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      journey_id   INTEGER NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
      traveller_id INTEGER REFERENCES journey_travellers(id) ON DELETE SET NULL,
      kind         TEXT NOT NULL,
      title        TEXT NOT NULL,
      file_name    TEXT NOT NULL,
      mime         TEXT,
      created_at   TEXT DEFAULT (datetime('now'))
    );
  `);

  // User-entered visas. These override the citizenship-aware defaults in
  // constants/visaPolicies.ts when an active visa exists for a country.
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS user_visas (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      country_code        TEXT NOT NULL,
      label               TEXT NOT NULL,
      valid_from          TEXT NOT NULL,
      valid_to            TEXT NOT NULL,
      max_days_per_stay   INTEGER,
      max_days_per_window INTEGER,
      window_days         INTEGER,
      entries_allowed     TEXT NOT NULL DEFAULT 'multiple',
      notes               TEXT,
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT,
      sync_id             TEXT,
      deleted             INTEGER DEFAULT 0
    );
  `);

  // Accommodation planning, one plan per journey stop (see
  // lib/accommodationModel.ts). Keyed by the stop's sync id rather than its
  // local row id: local ids never leave the phone, and the same sync id is
  // the cloud document id, so a plan an agent wrote and a plan typed in here
  // are the same row. No foreign key to journey_legs on purpose: legs are
  // deleted physically on a pull, and a cascade would drop the plan without
  // a tombstone, so the cloud copy would come straight back. Rows are
  // tombstoned instead (`deleted`), like journeys.
  //
  // Requirements and booking are stored as JSON: each is read and written
  // as one unit and never queried by field. Options get their own rows, they
  // are added, edited and picked one at a time.
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS accommodations (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_id                 TEXT NOT NULL UNIQUE,
      journey_sync_id         TEXT NOT NULL,
      needed                  INTEGER NOT NULL DEFAULT 1,
      status                  TEXT NOT NULL DEFAULT 'open',
      check_in                TEXT NOT NULL,
      check_out               TEXT NOT NULL,
      requirements            TEXT NOT NULL DEFAULT '{}',
      selected_option_sync_id TEXT,
      booking                 TEXT,
      notes                   TEXT,
      created_at              TEXT DEFAULT (datetime('now')),
      updated_at              TEXT NOT NULL,
      deleted                 INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_accommodations_journey ON accommodations(journey_sync_id);
    CREATE TABLE IF NOT EXISTS accommodation_options (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      accommodation_id    INTEGER NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
      sync_id             TEXT NOT NULL UNIQUE,
      name                TEXT NOT NULL,
      platform            TEXT,
      url                 TEXT,
      address             TEXT,
      check_in            TEXT NOT NULL,
      check_out           TEXT NOT NULL,
      total_price         REAL,
      price_per_night     REAL,
      currency            TEXT,
      fees                REAL,
      rating              REAL,
      rating_scale        INTEGER NOT NULL DEFAULT 5,
      review_count        INTEGER,
      cancellation_policy TEXT,
      amenities           TEXT NOT NULL DEFAULT '[]',
      score               REAL,
      risks               TEXT,
      notes               TEXT,
      last_checked_at     TEXT,
      sort_order          INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_accommodation_options_plan ON accommodation_options(accommodation_id);

    CREATE TABLE IF NOT EXISTS app_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migration: add sync columns
  const columns = await database.getAllAsync<{ name: string }>(
    `PRAGMA table_info(trips)`,
  );
  const colNames = columns.map((c) => c.name);
  if (!colNames.includes('sync_id')) {
    await database.execAsync(`ALTER TABLE trips ADD COLUMN sync_id TEXT`);
  }
  if (!colNames.includes('updated_at')) {
    await database.execAsync(`ALTER TABLE trips ADD COLUMN updated_at TEXT`);
  }
  if (!colNames.includes('deleted')) {
    await database.execAsync(`ALTER TABLE trips ADD COLUMN deleted INTEGER DEFAULT 0`);
  }

  // Migration: one row per cloud document.
  //
  // `sync_id` is the Firestore document id, so it can only ever describe one
  // local row. Nothing enforced that, and two writers raced: the first
  // onSnapshot callback delivers the whole collection as "added" while
  // pullTripsFromCloud fetches the same documents. Both did SELECT-then-INSERT,
  // both missed, both inserted. Every synced trip existed twice, which doubled
  // every day count downstream.
  //
  // Duplicates are exact copies of the same document, so the lowest id wins and
  // the rest go. The index then makes the race impossible rather than unlikely.
  await database.execAsync(`
    DELETE FROM trips WHERE sync_id IS NOT NULL AND id NOT IN (
      SELECT MIN(id) FROM trips WHERE sync_id IS NOT NULL GROUP BY sync_id
    );
    DELETE FROM user_visas WHERE sync_id IS NOT NULL AND id NOT IN (
      SELECT MIN(id) FROM user_visas WHERE sync_id IS NOT NULL GROUP BY sync_id
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_sync_id ON trips(sync_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_visas_sync_id ON user_visas(sync_id);
  `);

  // Migration: plans sync like trips. Each journey, stop and traveller gets a
  // stable id for the cloud document, and journeys are tombstoned rather than
  // deleted so the deletion reaches other devices.
  for (const [table, key] of [['journeys', 'journeys'], ['journey_legs', 'legs'], ['journey_travellers', 'travellers']] as const) {
    const cols = (await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name);
    if (!cols.includes('sync_id')) {
      await database.execAsync(`ALTER TABLE ${table} ADD COLUMN sync_id TEXT`);
    }
    if (key === 'journeys' && !cols.includes('deleted')) {
      await database.execAsync(`ALTER TABLE journeys ADD COLUMN deleted INTEGER DEFAULT 0`);
    }
    const missing = await database.getAllAsync<{ id: number }>(`SELECT id FROM ${table} WHERE sync_id IS NULL`);
    for (const row of missing) {
      await database.runAsync(`UPDATE ${table} SET sync_id = ? WHERE id = ?`, [Crypto.randomUUID(), row.id]);
    }
  }
  await database.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_journeys_sync_id ON journeys(sync_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_journey_legs_sync_id ON journey_legs(sync_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_journey_travellers_sync_id ON journey_travellers(sync_id);
  `);

  // Migration: trips shared with friends. `share_code` marks a journey this
  // phone owns and mirrors to `shared_journeys`; `shared_owner_*` marks one
  // that came from someone else's mirror and is read-only here. A traveller
  // with a `uid` is a friend who joined through the app, not just a name.
  for (const [table, column] of [
    ['journeys', 'share_code TEXT'],
    ['journeys', 'shared_owner_uid TEXT'],
    ['journeys', 'shared_owner_name TEXT'],
    ['journey_travellers', 'uid TEXT'],
    // The face a traveller picked (a DiceBear seed, lib/profile.ts); null
    // draws the default from their account or row id.
    ['journey_travellers', 'avatar TEXT'],
    // A plan that came with a friend's trip: shown, never pushed as ours.
    ['accommodations', 'followed INTEGER NOT NULL DEFAULT 0'],
    // Documents of a shared trip travel through Storage: a stable id for
    // the cloud record, who uploaded it, where the file is, and a clock.
    ['journey_documents', 'sync_id TEXT'],
    ['journey_documents', 'uploader_uid TEXT'],
    ['journey_documents', 'cloud_path TEXT'],
    ['journey_documents', 'updated_at TEXT'],
  ] as const) {
    const cols = (await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name);
    if (!cols.includes(column.split(' ')[0])) await database.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column}`);
  }
  for (const row of await database.getAllAsync<{ id: number }>('SELECT id FROM journey_documents WHERE sync_id IS NULL')) {
    await database.runAsync('UPDATE journey_documents SET sync_id = ? WHERE id = ?', [Crypto.randomUUID(), row.id]);
  }
  await database.execAsync('CREATE UNIQUE INDEX IF NOT EXISTS idx_journey_documents_sync_id ON journey_documents(sync_id)');

  // Migration: itineraries are chains (see `chainDates`). Trips planned before
  // that rule could hold gaps between stops; close them once.
  const journeyRows = await database.getAllAsync<{ id: number }>('SELECT id FROM journeys WHERE deleted = 0');
  for (const j of journeyRows) {
    const legs = await database.getAllAsync<JourneyLeg>(
      'SELECT * FROM journey_legs WHERE journey_id = ? ORDER BY sort_order ASC, start_date ASC',
      [j.id],
    );
    const dates = chainDates(legs);
    for (let i = 0; i < legs.length; i++) {
      if (legs[i].start_date === dates[i].start_date && legs[i].end_date === dates[i].end_date) continue;
      await database.runAsync('UPDATE journey_legs SET start_date = ?, end_date = ? WHERE id = ?', [dates[i].start_date, dates[i].end_date, legs[i].id]);
    }
  }

  // Migration: country names in English. The geocoder answered in the
  // phone's language before it was told not to, so older entries read
  // "Deutschland" or "Mexiko" next to English ones. The code decides.
  for (const table of ['trips', 'journey_legs'] as const) {
    const pairs = await database.getAllAsync<{ country_code: string; country: string }>(
      `SELECT DISTINCT country_code, country FROM ${table} WHERE country_code IS NOT NULL AND country_code != ''`,
    );
    for (const { country_code, country } of pairs) {
      const name = getCountryName(country_code);
      if (name && name !== country) {
        await database.runAsync(`UPDATE ${table} SET country = ? WHERE country_code = ? AND country = ?`, [name, country_code, country]);
      }
    }
  }

  await database.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/** The English name for a country code, so every entry reads the same whatever language it came in. */
function countryNameFor(code: string | null | undefined, given: string): string {
  return (code && getCountryName(code)) || given;
}

// Parses YYYY-MM-DD as local time (not UTC) to avoid off-by-one day in timezones ahead of UTC
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ─── Visit CRUD ───

export interface Visit {
  id: number;
  latitude: number;
  longitude: number;
  city: string | null;
  country: string | null;
  country_code: string | null;
  arrived_at: string;
  departed_at: string | null;
  created_at: string;
}

export async function insertVisit(
  latitude: number,
  longitude: number,
  city: string | null,
  country: string | null,
  countryCode: string | null,
): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO visits (latitude, longitude, city, country, country_code, arrived_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [latitude, longitude, city, country, countryCode],
  );
  return result.lastInsertRowId;
}

// ─── Trip CRUD ───

export interface Trip {
  id: number;
  city: string;
  country: string;
  country_code: string;
  latitude: number | null;
  longitude: number | null;
  start_date: string;
  end_date: string | null;
  days: number;
  sync_id: string | null;
  updated_at: string | null;
  deleted: number;
  /**
   * On entries from `getAllTrips`: every row folded into this one, oldest
   * first. The timeline shows one "Berlin" for three consecutive rows, so
   * deleting or editing it has to reach all three.
   */
  member_ids?: number[];
}

export async function insertTripManual(
  city: string,
  country: string,
  countryCode: string,
  startDate: string,
  endDate: string | null,
  latitude?: number | null,
  longitude?: number | null,
): Promise<number> {
  const database = await getDatabase();
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const result = await database.runAsync(
    `INSERT INTO trips (city, country, country_code, latitude, longitude, start_date, end_date, days, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [city, country, countryCode, latitude ?? null, longitude ?? null, startDate, endDate ?? null, days],
  );
  timelineChanged();
  return result.lastInsertRowId;
}

export async function updateTrip(
  id: number,
  city: string,
  country: string,
  countryCode: string,
  startDate: string,
  endDate: string | null,
  latitude?: number | null,
  longitude?: number | null,
): Promise<void> {
  const database = await getDatabase();
  const start = parseDate(startDate);
  const end = endDate ? parseDate(endDate) : new Date();
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  await database.runAsync(
    `UPDATE trips SET city=?, country=?, country_code=?, latitude=?, longitude=?, start_date=?, end_date=?, days=?, updated_at=datetime('now') WHERE id=?`,
    [city, country, countryCode, latitude ?? null, longitude ?? null, startDate, endDate ?? null, days, id],
  );
  timelineChanged();
}

/**
 * A tracked trip. `startDate` is the local calendar day of the fix that
 * started it: SQLite's `date('now')` is UTC, which in Bangkok is yesterday
 * until 7 in the morning, and `getCurrentTrip` compares with the local day.
 */
export async function insertTrip(
  city: string,
  country: string,
  countryCode: string,
  latitude: number,
  longitude: number,
  startDate: string,
): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO trips (city, country, country_code, latitude, longitude, start_date, days, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
    [city, country, countryCode, latitude, longitude, startDate],
  );
  timelineChanged();
  return result.lastInsertRowId;
}

/** Extend or close a trip to a local calendar day; never moves it backwards. */
export async function updateTripEndDate(tripId: number, endDate: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE trips SET
       end_date = CASE WHEN end_date IS NULL OR end_date < ? THEN ? ELSE end_date END,
       days = MAX(1, CAST(julianday(MAX(COALESCE(end_date, ?), ?)) - julianday(start_date) AS INTEGER) + 1),
       updated_at = datetime('now')
     WHERE id = ?`,
    [endDate, endDate, endDate, endDate, tripId],
  );
  timelineChanged();
}

/**
 * Apply a repair plan from `planRepair`: absorbing trips get their new end,
 * noise is tombstoned so the deletion syncs like any other.
 */
export async function applyTripRepair(plan: { extend: { id: number; end_date: string | null }[]; remove: number[] }): Promise<void> {
  const database = await getDatabase();
  for (const { id, end_date } of plan.extend) {
    await database.runAsync(
      `UPDATE trips SET
         end_date = ?,
         days = MAX(1, CAST(julianday(COALESCE(?, date('now', 'localtime'))) - julianday(start_date) AS INTEGER) + 1),
         updated_at = datetime('now')
       WHERE id = ?`,
      [end_date, end_date, id],
    );
  }
  for (const id of plan.remove) {
    await database.runAsync(
      `UPDATE trips SET deleted = 1, updated_at = datetime('now') WHERE id = ?`,
      [id],
    );
  }
  timelineChanged();
}

/**
 * The trip the user is on right now, as far as the local data can tell.
 *
 * Used by the background location task to decide whether a new position means
 * a new city. Getting it wrong is expensive: comparing against the wrong trip
 * creates a duplicate and fires a "welcome to" notification for a city the
 * user never left.
 *
 * The previous version ordered by `start_date` alone, so it had three ways to
 * pick the wrong row:
 *
 *   - It ignored `end_date`, so a finished trip that merely started later beat
 *     the one still running. A screenshot import, a manual entry or a sync from
 *     a second device is enough to trigger that.
 *   - It ignored `deleted`, so a soft-deleted trip could come back as current.
 *   - It ignored today's date, so a trip starting next month counted as
 *     current.
 *
 * Ordering now puts still-running trips first (`end_date IS NULL` yields 1),
 * then the latest start. Trips that have not begun yet are excluded outright.
 */
export async function getCurrentTrip(): Promise<Trip | null> {
  const database = await getDatabase();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return database.getFirstAsync<Trip>(
    `SELECT * FROM trips
     WHERE deleted = 0 AND start_date <= ?
     ORDER BY (end_date IS NULL) DESC, start_date DESC, id DESC
     LIMIT 1`,
    [todayStr],
  );
}

export async function getAllTripsRaw(): Promise<Trip[]> {
  const database = await getDatabase();
  return database.getAllAsync<Trip>(
    'SELECT * FROM trips WHERE deleted = 0 ORDER BY start_date ASC, id ASC',
  );
}

export async function getAllTrips(): Promise<Trip[]> {
  const raw = await getAllTripsRaw();
  if (raw.length === 0) return [];

  // Merge consecutive trips in the same city+country. Compared by country
  // code: older rows carry the country name in the phone's language, and
  // "Deutschland" next to "Germany" is still one stay.
  const merged: Trip[] = [{ ...raw[0], member_ids: [raw[0].id] }];

  for (let i = 1; i < raw.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = raw[i];

    const samePlace =
      prev.city.toLowerCase() === curr.city.toLowerCase() &&
      (prev.country_code && curr.country_code
        ? prev.country_code === curr.country_code
        : prev.country.toLowerCase() === curr.country.toLowerCase());

    // Adjacent: the next row starts at most one calendar day after this one
    // ends. Counted in days, not milliseconds, so the 25-hour day of a clock
    // change does not split a stay in two.
    const adjacent = (() => {
      const prevEnd = prev.end_date ? parseDate(prev.end_date) : new Date();
      const currStart = parseDate(curr.start_date);
      return currStart <= prevEnd || countDays(prevEnd, currStart) <= 2;
    })();

    if (samePlace && adjacent) {
      // Merge: extend prev trip. A row that ends earlier than the stay so
      // far (an overlap) must not cut it short.
      if (prev.end_date !== null) {
        prev.end_date = curr.end_date === null || curr.end_date > prev.end_date ? curr.end_date : prev.end_date;
      }
      const end = prev.end_date ? parseDate(prev.end_date) : new Date();
      prev.days = Math.max(1, countDays(parseDate(prev.start_date), end));
      prev.member_ids!.push(curr.id);
      // Keep coords from whichever has them
      if (!prev.latitude && curr.latitude) {
        prev.latitude = curr.latitude;
        prev.longitude = curr.longitude;
      }
    } else {
      merged.push({ ...curr, member_ids: [curr.id] });
    }
  }

  // Return newest first
  merged.reverse();

  // If the first (most recent) trip has end_date === today or no end_date, mark as present
  if (merged.length > 0) {
    const latest = merged[0];
    // The local calendar day: toISOString is UTC, which in Bangkok is still
    // yesterday until 7 in the morning.
    const today = toYmd(new Date());
    if (latest.end_date === today) {
      latest.end_date = null;
    }
  }

  return merged;
}

/** The timeline entry a row belongs to: the row itself plus any it was merged with. */
export async function getMergedTripContaining(id: number): Promise<Trip | null> {
  const entry = (await getAllTrips()).find((t) => t.member_ids?.includes(id));
  return entry ?? null;
}

/**
 * Delete a timeline entry: every row merged into it, as tombstones so the
 * sync removes them everywhere instead of pulling them back. Deleting only
 * the row that was tapped left the rest to merge into a shorter stay.
 */
export async function markTripGroupDeleted(id: number): Promise<void> {
  const entry = await getMergedTripContaining(id);
  const ids = entry?.member_ids ?? [id];
  const database = await getDatabase();
  await database.withExclusiveTransactionAsync(async (tx) => {
    for (const rowId of ids) {
      await tx.runAsync(
        `UPDATE trips SET deleted = 1, updated_at = datetime('now') WHERE id = ?`,
        [rowId],
      );
    }
  });
  timelineChanged();
}

/**
 * Edit a timeline entry. The first row takes the new values and the other
 * merged rows go, so the edited range is not overlapped by the old pieces.
 */
export async function updateTripGroup(
  id: number,
  city: string,
  country: string,
  countryCode: string,
  startDate: string,
  endDate: string | null,
  latitude?: number | null,
  longitude?: number | null,
): Promise<void> {
  const entry = await getMergedTripContaining(id);
  const ids = entry?.member_ids ?? [id];
  const [keep, ...rest] = ids;
  await updateTrip(keep, city, country, countryCode, startDate, endDate, latitude, longitude);
  if (rest.length === 0) return;
  const database = await getDatabase();
  await database.withExclusiveTransactionAsync(async (tx) => {
    for (const rowId of rest) {
      await tx.runAsync(
        `UPDATE trips SET deleted = 1, updated_at = datetime('now') WHERE id = ?`,
        [rowId],
      );
    }
  });
  timelineChanged();
}

export async function getTripsByCity(city: string, countryCode: string): Promise<Trip[]> {
  const database = await getDatabase();
  const raw = await database.getAllAsync<Trip>(
    `SELECT * FROM trips
     WHERE LOWER(city) = LOWER(?) AND country_code = ? AND deleted = 0
     ORDER BY start_date ASC`,
    [city, countryCode],
  );
  if (raw.length === 0) return [];

  // Merge consecutive trips (same logic as getAllTrips)
  const merged: Trip[] = [{ ...raw[0] }];
  for (let i = 1; i < raw.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = raw[i];
    const prevEnd = prev.end_date ? parseDate(prev.end_date) : new Date();
    const currStart = parseDate(curr.start_date);
    // Calendar days, like getAllTrips: the 25-hour day of a clock change is
    // not a gap.
    const adjacent = currStart <= prevEnd || countDays(prevEnd, currStart) <= 2;

    if (adjacent) {
      if (prev.end_date !== null) {
        prev.end_date = curr.end_date === null || curr.end_date > prev.end_date ? curr.end_date : prev.end_date;
      }
      const end = prev.end_date ? parseDate(prev.end_date) : new Date();
      prev.days = Math.max(1, countDays(parseDate(prev.start_date), end));
      if (!prev.latitude && curr.latitude) {
        prev.latitude = curr.latitude;
        prev.longitude = curr.longitude;
      }
    } else {
      merged.push({ ...curr });
    }
  }

  // Mark latest as present if end_date is today (the local day, not UTC's)
  const latest = merged[merged.length - 1];
  const today = toYmd(new Date());
  if (latest.end_date === today) latest.end_date = null;

  return merged;
}

// ─── Journey CRUD ───

export type TransportType = 'flight' | 'train' | 'car' | 'bus' | 'ferry' | 'walk';

export interface Journey {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  sync_id: string | null;
  deleted: number;
  /** Set once the owner made an invite link; the push mirrors the trip then. */
  share_code: string | null;
  /** Set on a trip that belongs to someone else and is followed here. Read-only. */
  shared_owner_uid: string | null;
  shared_owner_name: string | null;
  // computed fields from getAllJourneys()
  leg_count?: number;
  first_start?: string | null;
  last_end?: string | null;
  countries?: string; // JSON array of unique country_codes
  /** JSON array of [name, uid, sync_id] per traveller, for the faces on the card. */
  travellers?: string;
}

export interface JourneyLeg {
  id: number;
  journey_id: number;
  sync_id: string | null;
  city: string;
  country: string;
  country_code: string;
  latitude: number | null;
  longitude: number | null;
  start_date: string;
  end_date: string;
  transport: TransportType;
  notes: string | null;
  sort_order: number;
  created_at: string;
}

export interface JourneyWithLegs extends Journey {
  legs: JourneyLeg[];
}

export async function getAllJourneys(): Promise<Journey[]> {
  const database = await getDatabase();
  return database.getAllAsync<Journey>(`
    SELECT
      j.*,
      COUNT(l.id) AS leg_count,
      MIN(l.start_date) AS first_start,
      MAX(l.end_date) AS last_end,
      (
        SELECT json_group_array(DISTINCT l2.country_code)
        FROM journey_legs l2
        WHERE l2.journey_id = j.id
      ) AS countries,
      (
        SELECT json_group_array(json_array(t.name, t.uid, t.sync_id, t.avatar))
        FROM journey_travellers t
        WHERE t.journey_id = j.id
        ORDER BY t.sort_order ASC, t.id ASC
      ) AS travellers
    FROM journeys j
    LEFT JOIN journey_legs l ON l.journey_id = j.id
    WHERE j.deleted = 0
    GROUP BY j.id
    ORDER BY j.created_at DESC
  `);
}

export async function getJourneyWithLegs(id: number): Promise<JourneyWithLegs | null> {
  const database = await getDatabase();
  const journey = await database.getFirstAsync<Journey>(
    'SELECT * FROM journeys WHERE id = ? AND deleted = 0',
    [id],
  );
  if (!journey) return null;
  const legs = await database.getAllAsync<JourneyLeg>(
    'SELECT * FROM journey_legs WHERE journey_id = ? ORDER BY sort_order ASC, start_date ASC',
    [id],
  );
  return { ...journey, legs };
}

export async function insertJourney(title: string): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO journeys (title, sync_id) VALUES (?, ?)`,
    [title, Crypto.randomUUID()],
  );
  return result.lastInsertRowId;
}

export async function updateJourneyTitle(id: number, title: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE journeys SET title = ?, updated_at = datetime('now') WHERE id = ?`,
    [title, id],
  );
  localChanged();
}

/**
 * Tombstone, not a delete: the sync carries it to the other devices. Stops
 * and travellers stay with the tombstone (they are part of its document);
 * document rows go, they never leave the phone.
 */
export async function deleteJourney(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM journey_documents WHERE journey_id = ?', [id]);
  await database.runAsync(
    `UPDATE journeys SET deleted = 1, updated_at = datetime('now') WHERE id = ?`,
    [id],
  );
  const journey = await database.getFirstAsync<{ sync_id: string | null }>('SELECT sync_id FROM journeys WHERE id = ?', [id]);
  if (journey?.sync_id) {
    await database.runAsync(
      `UPDATE accommodations SET deleted = 1, updated_at = ? WHERE journey_sync_id = ? AND deleted = 0`,
      [new Date().toISOString(), journey.sync_id],
    );
  }
  localChanged();
}

/**
 * A stop that is gone takes its accommodation plan with it. Tombstoned, not
 * deleted, so the other devices and the agent learn about it through the
 * sync. Options go by cascade when the row itself is ever removed.
 */
async function tombstoneAccommodationsForStops(database: SQLite.SQLiteDatabase, stopSyncIds: (string | null)[]): Promise<void> {
  const ids = stopSyncIds.filter((x): x is string => !!x);
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  for (const syncId of ids) {
    await database.runAsync('UPDATE accommodations SET deleted = 1, updated_at = ? WHERE sync_id = ? AND deleted = 0', [now, syncId]);
  }
}

// ─── Journey sync ─────────────────────────────────────────────────────────────
// A journey syncs as one document: the journey itself plus its stops and
// travellers, compared as a whole by the journey's updated_at. Stops and
// travellers carry their own sync ids so a pull can update them in place and
// local ids stay stable (documents point at traveller ids).

export interface JourneySyncLeg {
  sync_id: string;
  city: string;
  country: string;
  country_code: string;
  latitude: number | null;
  longitude: number | null;
  start_date: string;
  end_date: string;
  transport: TransportType;
  notes: string | null;
  sort_order: number;
}

export interface JourneySyncTraveller {
  sync_id: string;
  name: string;
  sort_order: number;
  /** The friend's account, once they joined through the app. */
  uid?: string | null;
  /** Their chosen face, see JourneyTraveller.avatar. */
  avatar?: string | null;
}

export interface JourneyForSync {
  id: number;
  sync_id: string;
  title: string;
  updated_at: string;
  deleted: boolean;
  legs: JourneySyncLeg[];
  travellers: JourneySyncTraveller[];
  share_code: string | null;
  shared_owner_uid: string | null;
}

export async function getAllJourneysForSync(): Promise<JourneyForSync[]> {
  const database = await getDatabase();
  const journeys = await database.getAllAsync<Journey>('SELECT * FROM journeys ORDER BY id ASC');
  const legs = await database.getAllAsync<JourneyLeg>('SELECT * FROM journey_legs ORDER BY journey_id, sort_order, id');
  const travellers = await database.getAllAsync<JourneyTraveller>('SELECT * FROM journey_travellers ORDER BY journey_id, sort_order, id');
  return journeys.map((j) => ({
    id: j.id,
    sync_id: j.sync_id!,
    title: j.title,
    updated_at: j.updated_at,
    deleted: j.deleted === 1,
    legs: legs
      .filter((l) => l.journey_id === j.id)
      .map((l) => ({
        sync_id: l.sync_id!,
        city: l.city,
        country: l.country,
        country_code: l.country_code,
        latitude: l.latitude,
        longitude: l.longitude,
        start_date: l.start_date,
        end_date: l.end_date,
        transport: l.transport,
        notes: l.notes,
        sort_order: l.sort_order,
      })),
    travellers: travellers
      .filter((t) => t.journey_id === j.id)
      .map((t) => ({ sync_id: t.sync_id!, name: t.name, sort_order: t.sort_order, uid: t.uid ?? null, avatar: t.avatar ?? null })),
    share_code: j.share_code ?? null,
    shared_owner_uid: j.shared_owner_uid ?? null,
  }));
}

/**
 * Bring one cloud journey into the local database. The newer side wins as a
 * whole; on a pull, stops and travellers are matched by sync id and updated
 * in place, extra local ones go, missing ones are inserted.
 */
export async function upsertJourneyFromCloud(
  remote: Omit<JourneyForSync, 'id' | 'share_code' | 'shared_owner_uid'>,
  /** Given for a friend's trip pulled from `shared_journeys`; absent for this account's own. */
  sharedOwner: { uid: string; name: string } | null = null,
): Promise<void> {
  const database = await getDatabase();
  // All or nothing: the journey's stamp used to be written before its
  // stops, and an interruption in between left a half list of stops that
  // the stamp then declared current.
  await database.withExclusiveTransactionAsync((tx) => applyJourneyFromCloud(tx, remote, sharedOwner));
}

async function applyJourneyFromCloud(
  database: SQLite.SQLiteDatabase,
  remote: Omit<JourneyForSync, 'id' | 'share_code' | 'shared_owner_uid'>,
  sharedOwner: { uid: string; name: string } | null,
): Promise<void> {
  remote = { ...remote, legs: remote.legs.map((l) => ({ ...l, country: countryNameFor(l.country_code, l.country) })) };
  const existing = await database.getFirstAsync<Journey>('SELECT * FROM journeys WHERE sync_id = ?', [remote.sync_id]);

  // Last write wins between this phone and the cloud; a friend's trip has
  // no local edits to defend, their mirror is simply the truth.
  if (existing && !sharedOwner && localIsNewer(existing.updated_at, remote.updated_at)) return;

  let journeyId: number;
  if (existing) {
    await database.runAsync(
      'UPDATE journeys SET title = ?, updated_at = ?, deleted = ?, shared_owner_uid = ?, shared_owner_name = ? WHERE id = ?',
      [remote.title, remote.updated_at, remote.deleted ? 1 : 0, sharedOwner?.uid ?? existing.shared_owner_uid, sharedOwner?.name ?? existing.shared_owner_name, existing.id],
    );
    journeyId = existing.id;
  } else {
    if (remote.deleted) return;
    // OR IGNORE: the unique index on sync_id makes a concurrent second insert
    // of the same document (snapshot listener racing the pull) a no-op.
    await database.runAsync(
      'INSERT OR IGNORE INTO journeys (title, sync_id, updated_at, deleted, shared_owner_uid, shared_owner_name) VALUES (?, ?, ?, 0, ?, ?)',
      [remote.title, remote.sync_id, remote.updated_at, sharedOwner?.uid ?? null, sharedOwner?.name ?? null],
    );
    const row = await database.getFirstAsync<{ id: number }>('SELECT id FROM journeys WHERE sync_id = ?', [remote.sync_id]);
    if (!row) return;
    journeyId = row.id;
  }
  if (remote.deleted) return;

  // Stops
  const localLegs = await database.getAllAsync<JourneyLeg>('SELECT * FROM journey_legs WHERE journey_id = ?', [journeyId]);
  const remoteLegIds = new Set(remote.legs.map((l) => l.sync_id));
  const goneLegs = localLegs.filter((l) => !l.sync_id || !remoteLegIds.has(l.sync_id));
  for (const l of goneLegs) {
    await database.runAsync('DELETE FROM journey_legs WHERE id = ?', [l.id]);
  }
  await tombstoneAccommodationsForStops(database, goneLegs.map((l) => l.sync_id));
  for (const l of remote.legs) {
    const local = localLegs.find((x) => x.sync_id === l.sync_id);
    if (local) {
      await database.runAsync(
        `UPDATE journey_legs SET city=?, country=?, country_code=?, latitude=?, longitude=?,
           start_date=?, end_date=?, transport=?, notes=?, sort_order=? WHERE id=?`,
        [l.city, l.country, l.country_code, l.latitude, l.longitude, l.start_date, l.end_date, l.transport, l.notes, l.sort_order, local.id],
      );
    } else {
      await database.runAsync(
        `INSERT OR IGNORE INTO journey_legs
           (journey_id, city, country, country_code, latitude, longitude, start_date, end_date, transport, notes, sort_order, sync_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [journeyId, l.city, l.country, l.country_code, l.latitude, l.longitude, l.start_date, l.end_date, l.transport, l.notes, l.sort_order, l.sync_id],
      );
    }
  }

  // Travellers
  const localTravellers = await database.getAllAsync<JourneyTraveller>('SELECT * FROM journey_travellers WHERE journey_id = ?', [journeyId]);
  const remoteTravellerIds = new Set(remote.travellers.map((t) => t.sync_id));
  for (const t of localTravellers) {
    if (!t.sync_id || !remoteTravellerIds.has(t.sync_id)) {
      await database.runAsync('DELETE FROM journey_travellers WHERE id = ?', [t.id]);
    }
  }
  for (const t of remote.travellers) {
    const local = localTravellers.find((x) => x.sync_id === t.sync_id);
    if (local) {
      await database.runAsync('UPDATE journey_travellers SET name = ?, sort_order = ?, uid = ?, avatar = ? WHERE id = ?', [t.name, t.sort_order, t.uid ?? null, t.avatar ?? null, local.id]);
    } else {
      await database.runAsync(
        'INSERT OR IGNORE INTO journey_travellers (journey_id, name, sort_order, sync_id, uid, avatar) VALUES (?, ?, ?, ?, ?, ?)',
        [journeyId, t.name, t.sort_order, t.sync_id, t.uid ?? null, t.avatar ?? null],
      );
    }
  }
}

// ─── Trips shared with friends ────────────────────────────────────────────────

/** Remember the invite code of a trip this phone owns; null once sharing stopped. */
export async function setJourneyShareCode(journeyId: number, code: string | null): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE journeys SET share_code = ? WHERE id = ?', [code, journeyId]);
}

/**
 * The invite code as the mirror has it, for a trip this phone still shares.
 * Removing a friend replaces the code (their old link must stop working),
 * and every phone of the owner has to hand out the new one.
 */
export async function updateJourneyShareCodeBySyncId(syncId: string, code: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE journeys SET share_code = ? WHERE sync_id = ? AND share_code IS NOT NULL AND share_code != ?',
    [code, syncId, code],
  );
}

export async function clearJourneyShareCodeBySyncId(syncId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE journeys SET share_code = NULL WHERE sync_id = ?', [syncId]);
}

export async function getJourneyBySyncId(syncId: string): Promise<Journey | null> {
  const database = await getDatabase();
  return database.getFirstAsync<Journey>('SELECT * FROM journeys WHERE sync_id = ? AND deleted = 0', [syncId]);
}

/** Sync ids of the trips followed here, so a pull can notice one that is gone. */
export async function getFollowedJourneySyncIds(): Promise<string[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ sync_id: string }>('SELECT sync_id FROM journeys WHERE shared_owner_uid IS NOT NULL AND deleted = 0');
  return rows.map((r) => r.sync_id);
}

/**
 * A followed trip that is no longer shared with us (the owner stopped
 * sharing, or we left): removed outright, stops, travellers, documents and
 * the friend's plans with it. Not a tombstone: it was never ours to push,
 * and a tombstone with a fresh stamp would out-date the owner's mirror and
 * block the pull if we ever came back through the same link.
 */
export async function forgetFollowedJourney(syncId: string): Promise<void> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ id: number }>('SELECT id FROM journeys WHERE sync_id = ? AND shared_owner_uid IS NOT NULL', [syncId]);
  if (!row) return;
  await database.runAsync('DELETE FROM journeys WHERE id = ?', [row.id]);
  await database.runAsync('DELETE FROM accommodations WHERE journey_sync_id = ? AND followed = 1', [syncId]);
}

/**
 * The friends who joined a trip this phone owns, as travellers. One row per
 * account, named as they named themselves; a friend who was already listed
 * by hand under that exact name takes over that row. Returns whether
 * anything changed, so the caller can push the new list to the mirror.
 */
export async function syncJourneyMembers(syncId: string, members: { uid: string; name: string; avatar?: string | null }[], ownerUid: string): Promise<boolean> {
  const database = await getDatabase();
  const journey = await database.getFirstAsync<{ id: number }>('SELECT id FROM journeys WHERE sync_id = ? AND deleted = 0', [syncId]);
  if (!journey) return false;
  const travellers = await getJourneyTravellers(journey.id);
  let changed = false;
  // A friend who left or was removed stays as a name (their documents keep
  // their tab), just no longer as an account.
  for (const t of travellers) {
    if (t.uid && t.uid !== ownerUid && !members.some((m) => m.uid === t.uid)) {
      await database.runAsync('UPDATE journey_travellers SET uid = NULL WHERE id = ?', [t.id]);
      changed = true;
    }
  }
  for (const m of members) {
    const avatar = m.avatar ?? null;
    const byUid = travellers.find((t) => t.uid === m.uid);
    if (byUid) {
      if (byUid.name !== m.name || (byUid.avatar ?? null) !== avatar) {
        await database.runAsync('UPDATE journey_travellers SET name = ?, avatar = ? WHERE id = ?', [m.name, avatar, byUid.id]);
        changed = true;
      }
      continue;
    }
    const byName = travellers.find((t) => !t.uid && t.name.trim().toLowerCase() === m.name.trim().toLowerCase());
    if (byName) {
      await database.runAsync('UPDATE journey_travellers SET uid = ?, avatar = ? WHERE id = ?', [m.uid, avatar, byName.id]);
    } else {
      await database.runAsync(
        `INSERT INTO journey_travellers (journey_id, name, sort_order, sync_id, uid, avatar)
         VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM journey_travellers WHERE journey_id = ?), ?, ?, ?)`,
        [journey.id, m.name, journey.id, Crypto.randomUUID(), m.uid, avatar],
      );
    }
    changed = true;
  }
  if (changed) await touchJourney(journey.id);
  return changed;
}

export async function insertJourneyLeg(
  journeyId: number,
  city: string,
  country: string,
  countryCode: string,
  startDate: string,
  endDate: string,
  transport: TransportType,
  notes: string | null,
  latitude?: number | null,
  longitude?: number | null,
): Promise<number> {
  const database = await getDatabase();
  // Auto-assign sort_order to end of list
  const row = await database.getFirstAsync<{ max_order: number | null }>(
    'SELECT MAX(sort_order) as max_order FROM journey_legs WHERE journey_id = ?',
    [journeyId],
  );
  const nextOrder = (row?.max_order ?? -1) + 1;
  const result = await database.runAsync(
    `INSERT INTO journey_legs
       (journey_id, city, country, country_code, latitude, longitude, start_date, end_date, transport, notes, sort_order, sync_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [journeyId, city, country, countryCode, latitude ?? null, longitude ?? null, startDate, endDate, transport, notes ?? null, nextOrder, Crypto.randomUUID()],
  );
  await rechainJourneyLegs(journeyId);
  await touchJourney(journeyId);
  return result.lastInsertRowId;
}

export async function updateJourneyLeg(
  id: number,
  city: string,
  country: string,
  countryCode: string,
  startDate: string,
  endDate: string,
  transport: TransportType,
  notes: string | null,
  latitude?: number | null,
  longitude?: number | null,
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE journey_legs
     SET city=?, country=?, country_code=?, latitude=?, longitude=?,
         start_date=?, end_date=?, transport=?, notes=?
     WHERE id=?`,
    [city, country, countryCode, latitude ?? null, longitude ?? null, startDate, endDate, transport, notes ?? null, id],
  );
  // Bump parent journey updated_at
  const leg = await database.getFirstAsync<{ journey_id: number }>(
    'SELECT journey_id FROM journey_legs WHERE id = ?',
    [id],
  );
  if (leg) {
    await rechainJourneyLegs(leg.journey_id);
    await touchJourney(leg.journey_id);
  }
}

/**
 * Re-flow the dates so the stops form a chain (see `chainDates`). Runs after
 * every write to a journey's legs, so no screen can leave a gap or an overlap
 * behind. `anchor` pins the trip's start; by default the first stop keeps its
 * own start date.
 */
export async function rechainJourneyLegs(journeyId: number, anchor?: string): Promise<void> {
  const database = await getDatabase();
  const legs = await database.getAllAsync<JourneyLeg>(
    'SELECT * FROM journey_legs WHERE journey_id = ? ORDER BY sort_order ASC, start_date ASC',
    [journeyId],
  );
  const dates = chainDates(legs, anchor);
  for (let i = 0; i < legs.length; i++) {
    if (legs[i].start_date === dates[i].start_date && legs[i].end_date === dates[i].end_date) continue;
    await database.runAsync(
      'UPDATE journey_legs SET start_date = ?, end_date = ? WHERE id = ?',
      [dates[i].start_date, dates[i].end_date, legs[i].id],
    );
  }
}

export async function reorderJourneyLegs(journeyId: number, legIds: number[], anchor?: string): Promise<void> {
  const database = await getDatabase();
  for (let i = 0; i < legIds.length; i++) {
    await database.runAsync('UPDATE journey_legs SET sort_order = ? WHERE id = ?', [i, legIds[i]]);
  }
  await rechainJourneyLegs(journeyId, anchor);
  await touchJourney(journeyId);
}

export async function deleteJourneyLeg(id: number): Promise<void> {
  const database = await getDatabase();
  const leg = await database.getFirstAsync<{ journey_id: number; sync_id: string | null }>(
    'SELECT journey_id, sync_id FROM journey_legs WHERE id = ?',
    [id],
  );
  await database.runAsync('DELETE FROM journey_legs WHERE id = ?', [id]);
  if (leg) {
    await tombstoneAccommodationsForStops(database, [leg.sync_id]);
    await rechainJourneyLegs(leg.journey_id);
    await touchJourney(leg.journey_id);
  }
}

// ─── Sync Helpers ───

/** sync_id → updated_at of every synced trip, for skipping cloud documents that bring nothing new. */
export async function getTripSyncStamps(): Promise<Map<string, string | null>> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ sync_id: string; updated_at: string | null }>(
    'SELECT sync_id, updated_at FROM trips WHERE sync_id IS NOT NULL',
  );
  return new Map(rows.map((r) => [r.sync_id, r.updated_at]));
}

export async function getAllTripsForSync(): Promise<Trip[]> {
  const database = await getDatabase();
  return database.getAllAsync<Trip>(
    'SELECT * FROM trips ORDER BY id ASC',
  );
}

export async function upsertTripFromCloud(trip: {
  sync_id: string;
  city: string;
  country: string;
  country_code: string;
  latitude: number | null;
  longitude: number | null;
  start_date: string;
  end_date: string | null;
  days: number;
  updated_at: string;
  deleted: boolean;
  local_id?: number | null;
  install_id?: string | null;
}): Promise<void> {
  trip = { ...trip, country: countryNameFor(trip.country_code, trip.country) };
  const database = await getDatabase();

  // Check if we already have this trip by sync_id
  const existing = await database.getFirstAsync<Trip>(
    'SELECT * FROM trips WHERE sync_id = ?',
    [trip.sync_id],
  );

  if (existing) {
    // Last-write-wins: only update if cloud is newer. Compared as instants,
    // not as text: the two stamp formats do not sort against each other.
    if (localIsNewer(existing.updated_at, trip.updated_at)) {
      return; // local is newer or same, skip
    }
    if (trip.deleted) {
      await database.runAsync('DELETE FROM trips WHERE sync_id = ?', [trip.sync_id]);
    } else {
      await database.runAsync(
        `UPDATE trips SET city = ?, country = ?, country_code = ?, latitude = ?, longitude = ?,
         start_date = ?, end_date = ?, days = ?, updated_at = ?, deleted = 0
         WHERE sync_id = ?`,
        [trip.city, trip.country, trip.country_code, trip.latitude, trip.longitude,
         trip.start_date, trip.end_date, trip.days, trip.updated_at, trip.sync_id],
      );
    }
  } else if (!trip.deleted) {
    // The document may be this phone's own row coming back: the push writes
    // the document first and stores the new id on the row afterwards, and
    // the realtime listener can arrive in between. Adopting the row it
    // belongs to (`local_id`) keeps one trip one row; inserting instead
    // produced a second row, and the push's own write then died on the
    // unique index, which aborted the whole sync and left the row without
    // an id, so the next start made another copy. Thirty-six copies of one
    // stay in Berlin is what that looks like after a week.
    const adopted = trip.local_id && (await isFromThisInstall(trip.install_id))
      ? await database.runAsync(
          `UPDATE trips SET sync_id = ?, city = ?, country = ?, country_code = ?, latitude = ?, longitude = ?,
             start_date = ?, end_date = ?, days = ?, updated_at = ?, deleted = 0
           WHERE id = ? AND sync_id IS NULL`,
          [trip.sync_id, trip.city, trip.country, trip.country_code, trip.latitude, trip.longitude,
           trip.start_date, trip.end_date, trip.days, trip.updated_at, trip.local_id],
        )
      : null;
    if (adopted && adopted.changes > 0) return;

    // OR IGNORE, not plain INSERT: the unique index above turns a concurrent
    // second insert of the same document into a no-op instead of a crash.
    await database.runAsync(
      `INSERT OR IGNORE INTO trips (city, country, country_code, latitude, longitude, start_date, end_date, days, sync_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [trip.city, trip.country, trip.country_code, trip.latitude, trip.longitude,
       trip.start_date, trip.end_date, trip.days, trip.sync_id, trip.updated_at],
    );
  }
}

/**
 * Remember which cloud document a trip is, after the push created it.
 *
 * The id can already be taken: the realtime listener may have inserted a row
 * for the very document that was just written. Claiming it anyway threw
 * `UNIQUE constraint failed: trips.sync_id` and took the whole sync down
 * with it, so the row is given up instead: the copy that already carries
 * the id is the same trip, and this one is folded into it.
 */
export async function setSyncId(tripId: number, syncId: string): Promise<void> {
  const database = await getDatabase();
  const taken = await database.getFirstAsync<{ id: number }>(
    'SELECT id FROM trips WHERE sync_id = ? AND id != ?',
    [syncId, tripId],
  );
  if (taken) {
    await database.runAsync('DELETE FROM trips WHERE id = ? AND sync_id IS NULL', [tripId]);
    return;
  }
  await database.runAsync('UPDATE trips SET sync_id = ? WHERE id = ?', [syncId, tripId]);
}


// ─── Travellers and documents ───

export interface JourneyTraveller {
  id: number;
  journey_id: number;
  name: string;
  sort_order: number;
  sync_id: string | null;
  /** Set when this traveller is a friend who joined through the app. */
  uid: string | null;
  /** Their chosen face (DiceBear seed), when they picked one. */
  avatar?: string | null;
}

export interface JourneyDocument {
  id: number;
  journey_id: number;
  traveller_id: number | null;
  kind: string;
  title: string;
  file_name: string;
  mime: string | null;
  created_at: string;
  sync_id: string | null;
  /** Set once the file is in the cloud for a shared trip (see lib/documentSync.ts). */
  cloud_path: string | null;
  /** The account that added it; null for documents added before sharing existed. */
  uploader_uid: string | null;
  updated_at: string | null;
}

export async function getJourneyTravellers(journeyId: number): Promise<JourneyTraveller[]> {
  const database = await getDatabase();
  return database.getAllAsync<JourneyTraveller>(
    'SELECT * FROM journey_travellers WHERE journey_id = ? ORDER BY sort_order ASC, id ASC',
    [journeyId],
  );
}

export async function addJourneyTraveller(journeyId: number, name: string): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO journey_travellers (journey_id, name, sort_order, sync_id)
     VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM journey_travellers WHERE journey_id = ?), ?)`,
    [journeyId, name.trim(), journeyId, Crypto.randomUUID()],
  );
  await touchJourney(journeyId);
  return result.lastInsertRowId;
}

/**
 * Bump a journey's clock: the sync compares whole journeys, stops and
 * travellers included. Never on a friend's trip: a local stamp newer than
 * the owner's would make the pull skip their next change for good.
 */
async function touchJourney(journeyId: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`UPDATE journeys SET updated_at = datetime('now') WHERE id = ? AND shared_owner_uid IS NULL`, [journeyId]);
  localChanged();
}

/**
 * The user is always a traveller on their own trip. Created lazily the first
 * time a journey's wallet is used, so journeys that never touch documents
 * carry no rows.
 */
/**
 * Put this account's chosen face on its own traveller rows (on trips it owns;
 * on a friend's trip the friend's phone writes the row). Touches the journeys
 * that changed so the next push carries the face to the others.
 */
export async function applyMyAvatar(uid: string, avatar: string | null): Promise<void> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ id: number; journey_id: number }>(
    `SELECT t.id, t.journey_id FROM journey_travellers t JOIN journeys j ON j.id = t.journey_id
     WHERE t.uid = ? AND j.shared_owner_uid IS NULL AND j.deleted = 0 AND t.avatar IS NOT ?`,
    [uid, avatar],
  );
  for (const r of rows) {
    await database.runAsync('UPDATE journey_travellers SET avatar = ? WHERE id = ?', [avatar, r.id]);
  }
  for (const journeyId of new Set(rows.map((r) => r.journey_id))) await touchJourney(journeyId);
}

export async function ensureSelfTraveller(journeyId: number, uid: string | null = null): Promise<JourneyTraveller[]> {
  const database = await getDatabase();
  const existing = await getJourneyTravellers(journeyId);
  const journey = await database.getFirstAsync<{ shared_owner_uid: string | null }>('SELECT shared_owner_uid FROM journeys WHERE id = ?', [journeyId]);
  // A friend's trip has the friend's travellers; nothing is added here.
  if (journey?.shared_owner_uid) return existing;
  if (existing.length > 0) {
    // "You" carries the account from now on, so a friend following the trip
    // sees the owner's name where the owner sees "You".
    if (uid && existing[0].name === 'You' && !existing[0].uid) {
      await database.runAsync('UPDATE journey_travellers SET uid = ? WHERE id = ?', [uid, existing[0].id]);
      await touchJourney(journeyId);
      return getJourneyTravellers(journeyId);
    }
    return existing;
  }
  await database.runAsync(
    'INSERT INTO journey_travellers (journey_id, name, sort_order, sync_id, uid) VALUES (?, ?, 0, ?, ?)',
    [journeyId, 'You', Crypto.randomUUID(), uid],
  );
  await touchJourney(journeyId);
  return getJourneyTravellers(journeyId);
}

/**
 * A traveller's name as this phone should show it: the account holder is
 * "You" wherever they are; on a friend's trip the friend's own "You" is
 * their name.
 */
export function travellerLabel(t: JourneyTraveller, uid: string | null, journey: { shared_owner_uid: string | null; shared_owner_name: string | null } | null): string {
  if (uid && t.uid === uid) return 'You';
  if (journey?.shared_owner_uid && t.name === 'You' && (!t.uid || t.uid === journey.shared_owner_uid)) return journey.shared_owner_name ?? 'Your friend';
  return t.name;
}

export async function renameJourneyTraveller(id: number, name: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE journey_travellers SET name = ? WHERE id = ?', [name.trim(), id]);
  const row = await database.getFirstAsync<{ journey_id: number }>('SELECT journey_id FROM journey_travellers WHERE id = ?', [id]);
  if (row) await touchJourney(row.journey_id);
}

export async function deleteJourneyTraveller(id: number): Promise<void> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ journey_id: number }>('SELECT journey_id FROM journey_travellers WHERE id = ?', [id]);
  // Documents keep their file; they just stop being assigned to anyone.
  await database.runAsync('DELETE FROM journey_travellers WHERE id = ?', [id]);
  if (row) await touchJourney(row.journey_id);
}

export async function getJourneyDocuments(journeyId: number): Promise<JourneyDocument[]> {
  const database = await getDatabase();
  return database.getAllAsync<JourneyDocument>(
    'SELECT * FROM journey_documents WHERE journey_id = ? ORDER BY traveller_id ASC, kind ASC, id ASC',
    [journeyId],
  );
}

export async function getJourneyDocument(id: number): Promise<JourneyDocument | null> {
  const database = await getDatabase();
  return database.getFirstAsync<JourneyDocument>('SELECT * FROM journey_documents WHERE id = ?', [id]);
}

export async function addJourneyDocument(input: {
  journey_id: number;
  traveller_id: number | null;
  kind: string;
  title: string;
  file_name: string;
  mime: string | null;
  uploader_uid?: string | null;
}): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO journey_documents (journey_id, traveller_id, kind, title, file_name, mime, sync_id, uploader_uid, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.journey_id, input.traveller_id, input.kind, input.title.trim(), input.file_name, input.mime, Crypto.randomUUID(), input.uploader_uid ?? null, new Date().toISOString()],
  );
  localChanged();
  return result.lastInsertRowId;
}

/** Removes the row. The caller deletes the file, so the two never drift. */
export async function deleteJourneyDocument(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM journey_documents WHERE id = ?', [id]);
}

// ─── Documents of shared trips ────────────────────────────────────────────────

export async function getJourneyDocumentBySyncId(syncId: string): Promise<JourneyDocument | null> {
  const database = await getDatabase();
  return database.getFirstAsync<JourneyDocument>('SELECT * FROM journey_documents WHERE sync_id = ?', [syncId]);
}

export async function setJourneyDocumentCloudPath(id: number, cloudPath: string | null): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE journey_documents SET cloud_path = ? WHERE id = ?', [cloudPath, id]);
}

/**
 * A document that arrived from a shared trip's cloud record: inserted with
 * its downloaded file, or its title, kind and owner brought up to date.
 * `traveller_id` is resolved by the caller from the traveller's account.
 */
export async function upsertJourneyDocumentFromCloud(input: {
  sync_id: string;
  journey_id: number;
  traveller_id: number | null;
  kind: string;
  title: string;
  file_name: string;
  mime: string | null;
  cloud_path: string;
  uploader_uid: string | null;
  updated_at: string;
}): Promise<void> {
  const database = await getDatabase();
  const existing = await getJourneyDocumentBySyncId(input.sync_id);
  if (existing) {
    if (existing.updated_at && localIsNewer(existing.updated_at, input.updated_at)) return;
    await database.runAsync(
      'UPDATE journey_documents SET traveller_id = ?, kind = ?, title = ?, cloud_path = ?, uploader_uid = ?, updated_at = ? WHERE id = ?',
      [input.traveller_id, input.kind, input.title, input.cloud_path, input.uploader_uid, input.updated_at, existing.id],
    );
    return;
  }
  await database.runAsync(
    `INSERT OR IGNORE INTO journey_documents (journey_id, traveller_id, kind, title, file_name, mime, sync_id, cloud_path, uploader_uid, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.journey_id, input.traveller_id, input.kind, input.title, input.file_name, input.mime, input.sync_id, input.cloud_path, input.uploader_uid, input.updated_at],
  );
}
export type { Stats } from './stats';

/**
 * Aggregate stats for the tracking screen.
 *
 * Every day figure is the size of a set of calendar days, never a sum of trip
 * lengths. Summing double-counted the day you changed cities, and it also
 * doubled every number while the sync was inserting each trip twice.
 *
 * Pass `year` to scope to a calendar year, `null` for all time. A past year
 * runs to 31 December; the current year and all-time stop at today, so days
 * that have not happened yet never sit in a denominator.
 */
export async function getStats(
  year: number | null = null,
  homeCountryCode: string | null = null,
): Promise<Stats> {
  const trips = await getAllTripsRaw();
  const { availableYearsFromTrips } = await import('./yearFilter');
  const { statsFromTrips } = await import('./stats');
  return statsFromTrips(trips, year, homeCountryCode, availableYearsFromTrips(trips));
}

// ─── Data Management ───

/**
 * "Clear Travel Data": every trip becomes a tombstone rather than vanishing,
 * so the sync deletes it on every device. Rows deleted outright were pushed
 * straight back by a second phone that still held them. Visits are
 * device-local and simply go.
 */
export async function markAllTripsDeleted(): Promise<void> {
  const database = await getDatabase();
  await database.execAsync(`
    UPDATE trips SET deleted = 1, updated_at = datetime('now') WHERE deleted = 0;
    DELETE FROM visits;
  `);
}

/**
 * Every row of every user table, for when the data on this phone belongs to
 * someone else (a different account signed in) or to nobody (the account was
 * deleted). Children first, so no foreign key is left pointing at a deleted
 * parent. The autoincrement counters stay where they are, so a new row never
 * reuses the id of one that a cloud document or a cache still remembers.
 */
export async function wipeLocalDatabase(): Promise<void> {
  const database = await getDatabase();
  await database.withExclusiveTransactionAsync(async (tx) => {
    await tx.execAsync(`
      DELETE FROM accommodation_options;
      DELETE FROM accommodations;
      DELETE FROM journey_documents;
      DELETE FROM journey_travellers;
      DELETE FROM journey_legs;
      DELETE FROM journeys;
      DELETE FROM plans;
      DELETE FROM user_visas;
      DELETE FROM trips;
      DELETE FROM visits;
      DELETE FROM app_meta;
    `);
  });
  installIdCache = null;
}

let installIdCache: string | null = null;

/**
 * This install's id, sent with every pushed row next to its `local_id`.
 *
 * `local_id` is a row number, and row numbers are only unique on one
 * install: after a reinstall they start again at 1, and a second device has
 * its own 1. The pull adopts a local row for a cloud document only when the
 * document came from this very install; matching on the row number alone
 * let a trip from another device overwrite an unrelated one here.
 */
export async function getInstallId(): Promise<string> {
  if (installIdCache) return installIdCache;
  let id = await getMeta('install_id');
  if (!id) {
    id = Crypto.randomUUID();
    await setMeta('install_id', id);
  }
  installIdCache = id;
  return id;
}

/** True when a pulled document was pushed by this install, so its `local_id` means a row here. */
export async function isFromThisInstall(installId: string | null | undefined): Promise<boolean> {
  return !!installId && installId === (await getInstallId());
}

/** How long a deleted row stays on the phone after its deletion went to the cloud. */
const TOMBSTONE_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Remove rows deleted here long ago, once the deletion is in the cloud.
 *
 * A deleted row is kept as a marker so the push can tell the cloud and the
 * other devices; after that it only took up space, forever. Only local rows
 * go: the cloud keeps its markers, because a phone that was offline for
 * months still needs to learn about the deletion. A pull that meets such a
 * marker with no row here does nothing, so the row does not come back.
 *
 * Pushed means older than the collection's push mark (see pushScope in
 * lib/sync.ts). A journey that still has documents stays: its files on disk
 * belong to those rows.
 */
export async function purgeSyncedTombstones(): Promise<number> {
  const database = await getDatabase();
  const cutoff = new Date(Date.now() - TOMBSTONE_KEEP_MS).toISOString();
  const tables: { table: string; mark: string; also?: string }[] = [
    { table: 'trips', mark: 'trips' },
    { table: 'user_visas', mark: 'visas' },
    { table: 'journeys', mark: 'journeys', also: 'AND NOT EXISTS (SELECT 1 FROM journey_documents d WHERE d.journey_id = journeys.id)' },
    { table: 'accommodations', mark: 'accommodations' },
  ];
  let purged = 0;
  for (const { table, mark, also } of tables) {
    const pushedUntil = await getMeta(`push_mark:${mark}`);
    if (!pushedUntil) continue;
    // julianday reads both stamp formats in use ("2026-09-24 10:00:00" and ISO).
    const result = await database.runAsync(
      `DELETE FROM ${table}
       WHERE deleted = 1 AND julianday(updated_at) < julianday(?) AND julianday(updated_at) < julianday(?) ${also ?? ''}`,
      [cutoff, pushedUntil],
    );
    purged += result.changes;
  }
  return purged;
}

export async function getMeta(key: string): Promise<string | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM app_meta WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

// ─── Seed Data (for development/demo) ───

