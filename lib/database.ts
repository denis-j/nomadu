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
}

export async function insertTripManual(
  city: string,
  country: string,
  countryCode: string,
  startDate: string,
  endDate: string,
  latitude?: number | null,
  longitude?: number | null,
): Promise<number> {
  const database = await getDatabase();
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const result = await database.runAsync(
    `INSERT INTO trips (city, country, country_code, latitude, longitude, start_date, end_date, days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [city, country, countryCode, latitude ?? null, longitude ?? null, startDate, endDate, days],
  );
  return result.lastInsertRowId;
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
    `INSERT INTO trips (city, country, country_code, latitude, longitude, start_date, days)
     VALUES (?, ?, ?, ?, ?, date('now'), 1)`,
    [city, country, countryCode, latitude, longitude],
  );
  return result.lastInsertRowId;
}

export async function updateTripEndDate(tripId: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE trips SET
       end_date = date('now'),
       days = MAX(1, CAST(julianday(date('now')) - julianday(start_date) AS INTEGER) + 1)
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
    'SELECT * FROM trips ORDER BY start_date ASC, id ASC',
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
      const prevEnd = prev.end_date ? new Date(prev.end_date) : new Date();
      const currStart = new Date(curr.start_date);
      const diffMs = currStart.getTime() - prevEnd.getTime();
      return diffMs <= 24 * 60 * 60 * 1000; // 1 day gap tolerance
    })();

    if (samePlace && adjacent) {
      // Merge: extend prev trip
      prev.end_date = curr.end_date;
      const start = new Date(prev.start_date);
      const end = prev.end_date ? new Date(prev.end_date) : new Date();
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
    const prevEnd = prev.end_date ? new Date(prev.end_date) : new Date();
    const currStart = new Date(curr.start_date);
    const adjacent = currStart.getTime() - prevEnd.getTime() <= 24 * 60 * 60 * 1000;

    if (adjacent) {
      prev.end_date = curr.end_date;
      const start = new Date(prev.start_date);
      const end = prev.end_date ? new Date(prev.end_date) : new Date();
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

// ─── Stats Queries ───

export interface Stats {
  totalCountries: number;
  totalCities: number;
  totalDays: number;
  topCountries: { country: string; country_code: string; days: number }[];
}

export async function getStats(): Promise<Stats> {
  const database = await getDatabase();

  const countriesResult = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(DISTINCT country) as count FROM trips',
  );
  const citiesResult = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(DISTINCT city || country) as count FROM trips',
  );
  const daysResult = await database.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(days) as total FROM trips',
  );
  const topCountries = await database.getAllAsync<{
    country: string;
    country_code: string;
    days: number;
  }>(
    `SELECT country, country_code, SUM(days) as days
     FROM trips
     GROUP BY country, country_code
     ORDER BY days DESC
     LIMIT 10`,
  );

  return {
    totalCountries: countriesResult?.count ?? 0,
    totalCities: citiesResult?.count ?? 0,
    totalDays: daysResult?.total ?? 0,
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
