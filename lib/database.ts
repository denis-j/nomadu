import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('nomad.db');
  await migrate(db);
  return db;
}

async function migrate(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

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

export async function getLatestVisit(): Promise<Visit | null> {
  const database = await getDatabase();
  return database.getFirstAsync<Visit>(
    'SELECT * FROM visits ORDER BY arrived_at DESC LIMIT 1',
  );
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
}

export async function insertTrip(
  city: string,
  country: string,
  countryCode: string,
  latitude: number,
  longitude: number,
): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO trips (city, country, country_code, latitude, longitude, start_date, days, updated_at)
     VALUES (?, ?, ?, ?, ?, date('now'), 1, datetime('now'))`,
    [city, country, countryCode, latitude, longitude],
  );
  return result.lastInsertRowId;
}

export async function updateTripEndDate(tripId: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE trips SET
       end_date = date('now'),
       days = MAX(1, CAST(julianday(date('now')) - julianday(start_date) AS INTEGER) + 1),
       updated_at = datetime('now')
     WHERE id = ?`,
    [tripId],
  );
}

export async function getCurrentTrip(): Promise<Trip | null> {
  const database = await getDatabase();
  return database.getFirstAsync<Trip>(
    `SELECT * FROM trips ORDER BY start_date DESC, id DESC LIMIT 1`,
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

  // Merge consecutive trips in the same city+country
  const merged: Trip[] = [{ ...raw[0] }];

  for (let i = 1; i < raw.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = raw[i];

    const samePlace =
      prev.city.toLowerCase() === curr.city.toLowerCase() &&
      prev.country.toLowerCase() === curr.country.toLowerCase();

    // Check if dates are adjacent (prev end_date + 1 day >= curr start_date)
    const adjacent = (() => {
      const prevEnd = prev.end_date ? parseDate(prev.end_date) : new Date();
      const currStart = parseDate(curr.start_date);
      const diffMs = currStart.getTime() - prevEnd.getTime();
      return diffMs <= 24 * 60 * 60 * 1000; // 1 day gap tolerance
    })();

    if (samePlace && adjacent) {
      // Merge: extend prev trip
      prev.end_date = curr.end_date;
      const start = parseDate(prev.start_date);
      const end = prev.end_date ? parseDate(prev.end_date) : new Date();
      prev.days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      // Keep coords from whichever has them
      if (!prev.latitude && curr.latitude) {
        prev.latitude = curr.latitude;
        prev.longitude = curr.longitude;
      }
    } else {
      merged.push({ ...curr });
    }
  }

  // Return newest first
  merged.reverse();

  // If the first (most recent) trip has end_date === today or no end_date, mark as present
  if (merged.length > 0) {
    const latest = merged[0];
    const today = new Date().toISOString().split('T')[0];
    if (latest.end_date === today) {
      latest.end_date = null;
    }
  }

  return merged;
}

export async function deleteTrip(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM trips WHERE id = ?', [id]);
}

export async function markTripDeleted(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE trips SET deleted = 1, updated_at = datetime('now') WHERE id = ?`,
    [id],
  );
}

export async function getTripById(id: number): Promise<Trip | null> {
  const database = await getDatabase();
  return database.getFirstAsync<Trip>('SELECT * FROM trips WHERE id = ?', [id]);
}

export async function getTripsByCity(city: string, countryCode: string): Promise<Trip[]> {
  const database = await getDatabase();
  const raw = await database.getAllAsync<Trip>(
    `SELECT * FROM trips
     WHERE LOWER(city) = LOWER(?) AND country_code = ?
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
    const adjacent = currStart.getTime() - prevEnd.getTime() <= 24 * 60 * 60 * 1000;

    if (adjacent) {
      prev.end_date = curr.end_date;
      const start = parseDate(prev.start_date);
      const end = prev.end_date ? parseDate(prev.end_date) : new Date();
      prev.days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      if (!prev.latitude && curr.latitude) {
        prev.latitude = curr.latitude;
        prev.longitude = curr.longitude;
      }
    } else {
      merged.push({ ...curr });
    }
  }

  // Mark latest as present if end_date is today
  const latest = merged[merged.length - 1];
  const today = new Date().toISOString().split('T')[0];
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
  // computed fields from getAllJourneys()
  leg_count?: number;
  first_start?: string | null;
  last_end?: string | null;
  countries?: string; // JSON array of unique country_codes
}

export interface JourneyLeg {
  id: number;
  journey_id: number;
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
      ) AS countries
    FROM journeys j
    LEFT JOIN journey_legs l ON l.journey_id = j.id
    GROUP BY j.id
    ORDER BY j.created_at DESC
  `);
}

export async function getJourneyWithLegs(id: number): Promise<JourneyWithLegs | null> {
  const database = await getDatabase();
  const journey = await database.getFirstAsync<Journey>(
    'SELECT * FROM journeys WHERE id = ?',
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
    `INSERT INTO journeys (title) VALUES (?)`,
    [title],
  );
  return result.lastInsertRowId;
}

export async function updateJourneyTitle(id: number, title: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE journeys SET title = ?, updated_at = datetime('now') WHERE id = ?`,
    [title, id],
  );
}

export async function deleteJourney(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM journeys WHERE id = ?', [id]);
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
  sortOrder: number,
  latitude?: number | null,
  longitude?: number | null,
): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO journey_legs
       (journey_id, city, country, country_code, latitude, longitude, start_date, end_date, transport, notes, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [journeyId, city, country, countryCode, latitude ?? null, longitude ?? null, startDate, endDate, transport, notes ?? null, sortOrder],
  );
  // Also bump parent journey updated_at
  await database.runAsync(
    `UPDATE journeys SET updated_at = datetime('now') WHERE id = ?`,
    [journeyId],
  );
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
    await database.runAsync(
      `UPDATE journeys SET updated_at = datetime('now') WHERE id = ?`,
      [leg.journey_id],
    );
  }
}

export async function deleteJourneyLeg(id: number): Promise<void> {
  const database = await getDatabase();
  const leg = await database.getFirstAsync<{ journey_id: number }>(
    'SELECT journey_id FROM journey_legs WHERE id = ?',
    [id],
  );
  await database.runAsync('DELETE FROM journey_legs WHERE id = ?', [id]);
  if (leg) {
    await database.runAsync(
      `UPDATE journeys SET updated_at = datetime('now') WHERE id = ?`,
      [leg.journey_id],
    );
  }
}

// ─── Sync Helpers ───

export async function getAllTripsForSync(): Promise<Trip[]> {
  const database = await getDatabase();
  return database.getAllAsync<Trip>(
    'SELECT * FROM trips ORDER BY id ASC',
  );
}

export async function getTripsModifiedSince(timestamp: string): Promise<Trip[]> {
  const database = await getDatabase();
  return database.getAllAsync<Trip>(
    'SELECT * FROM trips WHERE updated_at > ? ORDER BY id ASC',
    [timestamp],
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
}): Promise<void> {
  const database = await getDatabase();

  // Check if we already have this trip by sync_id
  const existing = await database.getFirstAsync<Trip>(
    'SELECT * FROM trips WHERE sync_id = ?',
    [trip.sync_id],
  );

  if (existing) {
    // Last-write-wins: only update if cloud is newer
    if (existing.updated_at && existing.updated_at >= trip.updated_at) {
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
    await database.runAsync(
      `INSERT INTO trips (city, country, country_code, latitude, longitude, start_date, end_date, days, sync_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [trip.city, trip.country, trip.country_code, trip.latitude, trip.longitude,
       trip.start_date, trip.end_date, trip.days, trip.sync_id, trip.updated_at],
    );
  }
}

export async function setSyncId(tripId: number, syncId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE trips SET sync_id = ? WHERE id = ?', [syncId, tripId]);
}

// ─── Stats Queries ───

export interface Stats {
  totalCountries: number;
  totalCities: number;
  totalDays: number;
  topCountries: { country: string; country_code: string; days: number }[];
}

export async function getStats(): Promise<Stats> {
  // Use merged trips to avoid double-counting adjacent raw GPS entries
  const trips = await getAllTrips();

  const countrySet = new Set<string>();
  const citySet = new Set<string>();
  let totalDays = 0;
  const countryDays: Record<string, { country: string; country_code: string; days: number }> = {};

  for (const trip of trips) {
    countrySet.add(trip.country);
    citySet.add(`${trip.city}|${trip.country}`);
    totalDays += trip.days;

    const key = trip.country_code;
    if (!countryDays[key]) {
      countryDays[key] = { country: trip.country, country_code: trip.country_code, days: 0 };
    }
    countryDays[key].days += trip.days;
  }

  const topCountries = Object.values(countryDays)
    .sort((a, b) => b.days - a.days)
    .slice(0, 10);

  return {
    totalCountries: countrySet.size,
    totalCities: citySet.size,
    totalDays,
    topCountries,
  };
}

// ─── Data Management ───

export async function clearAllData(): Promise<void> {
  const database = await getDatabase();
  await database.execAsync(`
    DELETE FROM visits;
    DELETE FROM trips;
  `);
}

export async function exportTrips(): Promise<Trip[]> {
  return getAllTrips();
}

// ─── Seed Data (for development/demo) ───

export async function seedDemoData(): Promise<void> {
  const database = await getDatabase();

  const existing = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM trips',
  );
  if (existing && existing.count > 0) return;

  const demoTrips = [
    { city: 'Lisbon', country: 'Portugal', code: 'PT', lat: 38.7223, lng: -9.1393, start: '2025-11-01', end: '2025-11-28', days: 28 },
    { city: 'Barcelona', country: 'Spain', code: 'ES', lat: 41.3874, lng: 2.1686, start: '2025-12-01', end: '2025-12-20', days: 20 },
    { city: 'Bangkok', country: 'Thailand', code: 'TH', lat: 13.7563, lng: 100.5018, start: '2026-01-05', end: '2026-01-25', days: 21 },
    { city: 'Chiang Mai', country: 'Thailand', code: 'TH', lat: 18.7883, lng: 98.9853, start: '2026-01-26', end: '2026-02-15', days: 21 },
    { city: 'Tokyo', country: 'Japan', code: 'JP', lat: 35.6762, lng: 139.6503, start: '2026-02-18', end: '2026-03-05', days: 16 },
    { city: 'Ljubljana', country: 'Slovenia', code: 'SI', lat: 46.0569, lng: 14.5058, start: '2026-03-08', end: null, days: 8 },
  ];

  for (const trip of demoTrips) {
    await database.runAsync(
      `INSERT INTO trips (city, country, country_code, latitude, longitude, start_date, end_date, days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [trip.city, trip.country, trip.code, trip.lat, trip.lng, trip.start, trip.end, trip.days],
    );
  }
}
