import * as Crypto from 'expo-crypto';
import { getDatabase } from './database';
import { localIsNewer } from './syncTime';
import { localChanged } from './syncTrigger';
import {
  EMPTY_REQUIREMENTS,
  addOption,
  createPlan,
  removeOption,
  saveBooking,
  selectOption,
  setNotes,
  setStatus,
  updateOption,
  updatePlan,
  type AccommodationBooking,
  type AccommodationOption,
  type AccommodationPlan,
  type AccommodationRequirements,
  type AccommodationStatus,
} from './accommodationModel';

/**
 * Accommodation plans on the phone.
 *
 * The rules live in `accommodationModel.ts`; this file only reads a plan out
 * of SQLite, hands it to one of the model's transitions and writes the
 * result back. Every write bumps `updated_at`, which is what the sync
 * compares (`lib/sync.ts`, same last-write-wins as journeys), so a plan an
 * agent edited and a plan edited here meet in the cloud by time.
 *
 * Rows are keyed by the stop's sync id (`sync_id`), see the table comment
 * in `database.ts`.
 */

export interface LocalAccommodation extends AccommodationPlan {
  local_id: number;
  updated_at: string;
  /** Came with a friend's trip: read here, owned there. */
  followed: boolean;
}

interface PlanRow {
  id: number;
  sync_id: string;
  journey_sync_id: string;
  needed: number;
  status: AccommodationStatus;
  check_in: string;
  check_out: string;
  requirements: string;
  selected_option_sync_id: string | null;
  booking: string | null;
  notes: string | null;
  updated_at: string;
  deleted: number;
  followed: number;
}

interface OptionRow {
  id: number;
  accommodation_id: number;
  sync_id: string;
  name: string;
  platform: string | null;
  url: string | null;
  address: string | null;
  check_in: string;
  check_out: string;
  total_price: number | null;
  price_per_night: number | null;
  currency: string | null;
  fees: number | null;
  rating: number | null;
  rating_scale: number;
  review_count: number | null;
  cancellation_policy: string | null;
  amenities: string;
  score: number | null;
  risks: string | null;
  notes: string | null;
  last_checked_at: string | null;
  sort_order: number;
}

/** ISO like the visas, not `datetime('now')`: see `userVisas.ts`. */
function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function optionFromRow(r: OptionRow): AccommodationOption {
  return {
    id: r.sync_id,
    name: r.name,
    platform: r.platform,
    url: r.url,
    address: r.address,
    check_in: r.check_in,
    check_out: r.check_out,
    total_price: r.total_price,
    price_per_night: r.price_per_night,
    currency: r.currency,
    fees: r.fees,
    rating: r.rating,
    rating_scale: r.rating_scale === 10 ? 10 : 5,
    review_count: r.review_count,
    cancellation_policy: r.cancellation_policy,
    amenities: parseJson<string[]>(r.amenities, []),
    score: r.score,
    risks: r.risks,
    notes: r.notes,
    last_checked_at: r.last_checked_at,
    sort_order: r.sort_order,
  };
}

function planFromRows(row: PlanRow, options: OptionRow[]): LocalAccommodation {
  return {
    local_id: row.id,
    updated_at: row.updated_at,
    followed: row.followed === 1,
    id: row.sync_id,
    journey_id: row.journey_sync_id,
    stop_id: row.sync_id,
    needed: row.needed === 1,
    status: row.status,
    check_in: row.check_in,
    check_out: row.check_out,
    requirements: { ...EMPTY_REQUIREMENTS, ...parseJson<Partial<AccommodationRequirements>>(row.requirements, {}) },
    options: options.map(optionFromRow).sort((a, b) => a.sort_order - b.sort_order),
    selected_option_id: row.selected_option_sync_id,
    booking: parseJson<AccommodationBooking | null>(row.booking, null),
    notes: row.notes,
  };
}

async function loadOptions(accommodationId: number): Promise<OptionRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<OptionRow>(
    'SELECT * FROM accommodation_options WHERE accommodation_id = ? ORDER BY sort_order ASC, id ASC',
    [accommodationId],
  );
}

async function loadRow(stopSyncId: string): Promise<PlanRow | null> {
  const db = await getDatabase();
  return db.getFirstAsync<PlanRow>('SELECT * FROM accommodations WHERE sync_id = ?', [stopSyncId]);
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function getAccommodationForStop(stopSyncId: string): Promise<LocalAccommodation | null> {
  const row = await loadRow(stopSyncId);
  if (!row || row.deleted === 1) return null;
  return planFromRows(row, await loadOptions(row.id));
}

/**
 * Every live plan of a journey, by stop sync id. Keyed by the journey's
 * local id so the itinerary can ask for its plans in the same breath as
 * for the journey itself, before it knows the sync id.
 */
export async function getAccommodationsForJourney(journeyId: number): Promise<Map<string, LocalAccommodation>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PlanRow>(
    `SELECT a.* FROM accommodations a
       JOIN journeys j ON j.sync_id = a.journey_sync_id
      WHERE j.id = ? AND a.deleted = 0`,
    [journeyId],
  );
  if (rows.length === 0) return new Map();
  // One read for every option of the journey, not one per plan: this runs
  // each time the itinerary comes into view.
  const options = await db.getAllAsync<OptionRow>(
    `SELECT o.* FROM accommodation_options o
       JOIN accommodations a ON a.id = o.accommodation_id
       JOIN journeys j ON j.sync_id = a.journey_sync_id
      WHERE j.id = ? AND a.deleted = 0
      ORDER BY o.sort_order ASC, o.id ASC`,
    [journeyId],
  );
  const byPlan = new Map<number, OptionRow[]>();
  for (const o of options) {
    const list = byPlan.get(o.accommodation_id) ?? [];
    list.push(o);
    byPlan.set(o.accommodation_id, list);
  }
  const out = new Map<string, LocalAccommodation>();
  for (const row of rows) out.set(row.sync_id, planFromRows(row, byPlan.get(row.id) ?? []));
  return out;
}

// ─── Writes ──────────────────────────────────────────────────────────────────

/**
 * Store a whole plan: the row is upserted by sync id, options are matched
 * by id and updated in place, gone ones are removed. One function for every
 * transition, so no path can forget an option.
 */
async function writePlan(plan: AccommodationPlan, updatedAt: string, followed = false): Promise<LocalAccommodation> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO accommodations
       (sync_id, journey_sync_id, needed, status, check_in, check_out, requirements, selected_option_sync_id, booking, notes, updated_at, deleted, followed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(sync_id) DO UPDATE SET
       journey_sync_id = excluded.journey_sync_id,
       needed = excluded.needed,
       status = excluded.status,
       check_in = excluded.check_in,
       check_out = excluded.check_out,
       requirements = excluded.requirements,
       selected_option_sync_id = excluded.selected_option_sync_id,
       booking = excluded.booking,
       notes = excluded.notes,
       updated_at = excluded.updated_at,
       deleted = 0,
       followed = excluded.followed`,
    [
      plan.id,
      plan.journey_id,
      plan.needed ? 1 : 0,
      plan.status,
      plan.check_in,
      plan.check_out,
      JSON.stringify(plan.requirements),
      plan.selected_option_id,
      plan.booking ? JSON.stringify(plan.booking) : null,
      plan.notes,
      updatedAt,
      followed ? 1 : 0,
    ],
  );
  const row = (await loadRow(plan.id))!;

  const existing = await loadOptions(row.id);
  const keep = new Set(plan.options.map((o) => o.id));
  for (const o of existing) {
    if (!keep.has(o.sync_id)) await db.runAsync('DELETE FROM accommodation_options WHERE id = ?', [o.id]);
  }
  for (const o of plan.options) {
    await db.runAsync(
      `INSERT INTO accommodation_options
         (accommodation_id, sync_id, name, platform, url, address, check_in, check_out, total_price, price_per_night,
          currency, fees, rating, rating_scale, review_count, cancellation_policy, amenities, score, risks, notes,
          last_checked_at, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sync_id) DO UPDATE SET
         accommodation_id = excluded.accommodation_id, name = excluded.name, platform = excluded.platform,
         url = excluded.url, address = excluded.address, check_in = excluded.check_in, check_out = excluded.check_out,
         total_price = excluded.total_price, price_per_night = excluded.price_per_night, currency = excluded.currency,
         fees = excluded.fees, rating = excluded.rating, rating_scale = excluded.rating_scale,
         review_count = excluded.review_count, cancellation_policy = excluded.cancellation_policy,
         amenities = excluded.amenities, score = excluded.score, risks = excluded.risks, notes = excluded.notes,
         last_checked_at = excluded.last_checked_at, sort_order = excluded.sort_order`,
      [
        row.id, o.id, o.name, o.platform, o.url, o.address, o.check_in, o.check_out, o.total_price, o.price_per_night,
        o.currency, o.fees, o.rating, o.rating_scale, o.review_count, o.cancellation_policy, JSON.stringify(o.amenities),
        o.score, o.risks, o.notes, o.last_checked_at, o.sort_order,
      ],
    );
  }
  return planFromRows(row, await loadOptions(row.id));
}

/** A write from this phone (never from a pull): the sync should push soon. */
async function writeLocal(plan: AccommodationPlan): Promise<LocalAccommodation> {
  const out = await writePlan(plan, nowIso());
  localChanged();
  return out;
}

async function requirePlan(stopSyncId: string): Promise<LocalAccommodation> {
  const plan = await getAccommodationForStop(stopSyncId);
  if (!plan) throw new Error('No accommodation plan for this stop.');
  return plan;
}

/** Start planning a place for a stop. A plan that already exists is returned as is. */
export async function startAccommodation(
  journeySyncId: string,
  stop: { sync_id: string; start_date: string; end_date: string },
  input: unknown = {},
): Promise<LocalAccommodation> {
  const existing = await getAccommodationForStop(stop.sync_id);
  if (existing) return existing;
  const plan = createPlan(journeySyncId, { id: stop.sync_id, start_date: stop.start_date, end_date: stop.end_date }, input);
  return writeLocal(plan);
}

export async function updateAccommodation(stopSyncId: string, input: unknown): Promise<LocalAccommodation> {
  return writeLocal(updatePlan(await requirePlan(stopSyncId), input));
}

export async function setAccommodationStatus(stopSyncId: string, status: AccommodationStatus): Promise<LocalAccommodation> {
  return writeLocal(setStatus(await requirePlan(stopSyncId), status));
}

export async function setAccommodationNotes(stopSyncId: string, notes: string | null): Promise<LocalAccommodation> {
  return writeLocal(setNotes(await requirePlan(stopSyncId), notes));
}

export async function addAccommodationOption(stopSyncId: string, input: unknown): Promise<LocalAccommodation> {
  return writeLocal(addOption(await requirePlan(stopSyncId), input, Crypto.randomUUID()));
}

export async function updateAccommodationOption(stopSyncId: string, optionId: string, input: unknown): Promise<LocalAccommodation> {
  return writeLocal(updateOption(await requirePlan(stopSyncId), optionId, input));
}

export async function removeAccommodationOption(stopSyncId: string, optionId: string): Promise<LocalAccommodation> {
  return writeLocal(removeOption(await requirePlan(stopSyncId), optionId));
}

export async function selectAccommodationOption(stopSyncId: string, optionId: string | null): Promise<LocalAccommodation> {
  return writeLocal(selectOption(await requirePlan(stopSyncId), optionId));
}

export async function saveAccommodationBooking(stopSyncId: string, input: unknown): Promise<LocalAccommodation> {
  return writeLocal(saveBooking(await requirePlan(stopSyncId), input));
}

/** Tombstone: the plan disappears from the app and, through the sync, from the agent. */
export async function deleteAccommodation(stopSyncId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE accommodations SET deleted = 1, updated_at = ? WHERE sync_id = ?', [nowIso(), stopSyncId]);
  localChanged();
}

// ─── Sync ────────────────────────────────────────────────────────────────────
// One cloud document per plan with the options embedded, compared as a whole
// by updated_at, exactly like a journey and its stops.

export interface AccommodationForSync extends AccommodationPlan {
  local_id: number;
  updated_at: string;
  deleted: boolean;
  followed: boolean;
}

/** This account's own plans, tombstones included; a friend's plans are not ours to push. */
export async function getAllAccommodationsForSync(): Promise<AccommodationForSync[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PlanRow>('SELECT * FROM accommodations WHERE followed = 0 ORDER BY id ASC');
  const out: AccommodationForSync[] = [];
  for (const row of rows) {
    const plan = planFromRows(row, row.deleted === 1 ? [] : await loadOptions(row.id));
    out.push({ ...plan, deleted: row.deleted === 1 });
  }
  return out;
}

/**
 * The plans that came with a friend's trip, as the mirror has them now.
 * Written whole: a plan the owner removed is no longer in the list and is
 * tombstoned here. Nothing in the app writes to these otherwise, so there
 * is no local edit to protect and the mirror simply wins.
 */
export async function replaceFollowedPlans(journeySyncId: string, plans: (AccommodationPlan & { updated_at: string })[]): Promise<void> {
  const db = await getDatabase();
  const keep = new Set(plans.map((p) => p.id));
  const local = await db.getAllAsync<{ sync_id: string }>('SELECT sync_id FROM accommodations WHERE journey_sync_id = ? AND followed = 1 AND deleted = 0', [journeySyncId]);
  for (const row of local) {
    if (!keep.has(row.sync_id)) {
      await db.runAsync('UPDATE accommodations SET deleted = 1, updated_at = ? WHERE sync_id = ?', [nowIso(), row.sync_id]);
    }
  }
  for (const plan of plans) await writePlan(plan, plan.updated_at, true);
}

/**
 * Bring one cloud plan into the local database. Newer side wins as a whole;
 * a cloud tombstone tombstones the local row.
 */
export async function upsertAccommodationFromCloud(remote: Omit<AccommodationForSync, 'local_id' | 'followed'>): Promise<void> {
  const existing = await loadRow(remote.id);
  if (existing && localIsNewer(existing.updated_at, remote.updated_at)) return;
  if (remote.deleted) {
    if (existing) {
      const db = await getDatabase();
      await db.runAsync('UPDATE accommodations SET deleted = 1, updated_at = ? WHERE id = ?', [remote.updated_at, existing.id]);
      await db.runAsync('DELETE FROM accommodation_options WHERE accommodation_id = ?', [existing.id]);
    }
    return;
  }
  await writePlan(remote, remote.updated_at);
}
