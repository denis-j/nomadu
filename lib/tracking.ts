import { haversineKm } from '../utils/geography';
import { countDays, fromYmd, toYmd } from './days';

/**
 * Turning location fixes into trips.
 *
 * Pure decisions, no I/O, so the rules can be tested against a recorded day.
 * The day that shaped them: a flight from Phuket to Kuala Lumpur produced ten
 * alternating one-day trips, because every reading anywhere else immediately
 * became a new trip. Readings lie: a foreground check hands back a cached fix
 * from before the flight, a background batch arrives hours late, an airport
 * wifi position lands in the wrong district. So a fix has to be fresh and
 * accurate to count at all, and a change of place has to be seen twice, some
 * time apart, before the timeline believes it.
 */

export interface Fix {
  latitude: number;
  longitude: number;
  /** Unix ms, from the location provider, not from when we got round to it. */
  timestamp: number;
  /** Horizontal accuracy in metres, null when unknown. */
  accuracy: number | null;
}

export interface Place {
  city: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}

/** A place seen once that is not yet a trip. */
export interface Candidate {
  place: Place;
  firstSeenAt: number;
  lastSeenAt: number;
  sightings: number;
}

export interface CurrentTrip {
  id: number;
  city: string;
  country: string;
  country_code: string;
  latitude: number | null;
  longitude: number | null;
  start_date: string;
  end_date: string | null;
}

/** Readings within this range of the current trip are the same city. */
export const CITY_RADIUS_KM = 20;
/** A new place counts once it has been seen this often... */
export const CONFIRM_SIGHTINGS = 2;
/** ...and this long after the first sighting. */
export const CONFIRM_AFTER_MS = 20 * 60 * 1000;
/** Worse than this and the fix says nothing about which city you are in. */
export const MAX_ACCURACY_M = 5000;
/** A cached position older than this is a memory, not a location. */
export const MAX_FOREGROUND_AGE_MS = 15 * 60 * 1000;

export type Decision =
  | { kind: 'ignore'; reason: 'inaccurate' | 'stale' }
  | { kind: 'start'; place: Place; date: string }
  | { kind: 'extend'; tripId: number; date: string }
  | { kind: 'pending' }
  | { kind: 'switch'; closeTripId: number; closeDate: string; place: Place; startDate: string };

export function samePlace(
  a: { city: string; country_code: string; latitude: number | null; longitude: number | null },
  b: { city: string; countryCode: string; latitude: number; longitude: number },
): boolean {
  if (a.country_code !== b.countryCode) return false;
  if (a.city === b.city) return true;
  if (a.latitude == null || a.longitude == null) return false;
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) < CITY_RADIUS_KM;
}

function sameCandidate(c: Candidate, p: Place): boolean {
  return samePlace(
    { city: c.place.city, country_code: c.place.countryCode, latitude: c.place.latitude, longitude: c.place.longitude },
    p,
  );
}

/**
 * What one fix means for the timeline, given the current trip and what has
 * been seen so far. Returns the decision and the candidate state to persist.
 */
export function decide(input: {
  current: CurrentTrip | null;
  place: Place;
  fix: Fix;
  pending: Candidate | null;
  lastFixAt: number | null;
}): { decision: Decision; pending: Candidate | null } {
  const { current, place, fix, pending, lastFixAt } = input;

  if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) {
    return { decision: { kind: 'ignore', reason: 'inaccurate' }, pending };
  }
  // Older than something already processed: a cached position, or a batch
  // delivered out of order. It describes the past and the past is booked.
  if (lastFixAt != null && fix.timestamp <= lastFixAt) {
    return { decision: { kind: 'ignore', reason: 'stale' }, pending };
  }

  const date = toYmd(new Date(fix.timestamp));

  if (!current) {
    return { decision: { kind: 'start', place, date }, pending: null };
  }

  if (samePlace(current, place)) {
    // Home again, or the candidate was a glitch. Either way it is forgotten.
    return { decision: { kind: 'extend', tripId: current.id, date }, pending: null };
  }

  if (pending && sameCandidate(pending, place)) {
    const next: Candidate = {
      ...pending,
      lastSeenAt: fix.timestamp,
      sightings: pending.sightings + 1,
    };
    if (next.sightings >= CONFIRM_SIGHTINGS && fix.timestamp - next.firstSeenAt >= CONFIRM_AFTER_MS) {
      // Confirmed. The move happened when it was first seen, not now: the
      // old trip ends and the new one starts on that day, both sharing it,
      // the way a travel day always did.
      let moved = toYmd(new Date(next.firstSeenAt));
      if (moved < current.start_date) moved = current.start_date;
      return {
        decision: { kind: 'switch', closeTripId: current.id, closeDate: moved, place: next.place, startDate: moved },
        pending: null,
      };
    }
    return { decision: { kind: 'pending' }, pending: next };
  }

  // Somewhere new, seen for the first time. Not a trip yet.
  return {
    decision: { kind: 'pending' },
    pending: { place, firstSeenAt: fix.timestamp, lastSeenAt: fix.timestamp, sightings: 1 },
  };
}

// ─── Repair ──────────────────────────────────────────────────────────────────

export interface RepairableTrip {
  id: number;
  city: string;
  country_code: string;
  latitude: number | null;
  longitude: number | null;
  start_date: string;
  end_date: string | null;
}

export interface RepairPlan {
  /** Trips that absorb a neighbour; `end_date` null keeps them open. */
  extend: { id: number; end_date: string | null }[];
  /** Trips that were noise. */
  remove: number[];
}

function addDays(ymd: string, n: number): string {
  const d = fromYmd(ymd);
  d.setDate(d.getDate() + n);
  return toYmd(d);
}

function spanDays(t: RepairableTrip, today: string): number {
  return countDays(fromYmd(t.start_date), fromYmd(t.end_date ?? today));
}

function sameTripPlace(a: RepairableTrip, b: RepairableTrip): boolean {
  return samePlace(a, {
    city: b.city,
    countryCode: b.country_code,
    latitude: b.latitude ?? Number.NaN,
    longitude: b.longitude ?? Number.NaN,
  });
}

/**
 * Undo what the old rules left behind, without touching anything a person
 * could have meant.
 *
 * Three patterns, applied until nothing changes:
 *  1. Two trips with the same dates at the same place (by name, or within the
 *     city radius: "Lissabon" and "Lisbon") are one trip.
 *  2. Two consecutive trips with the same name that touch or overlap are one
 *     stay, which is what the timeline already shows for them. Nearby but
 *     differently named places are left alone here, history may know better,
 *     unless the second is a one-day fragment.
 *  3. A one-day trip wedged between two trips at the same other place is a
 *     glitch, not a day trip. (A cached fix from before the flight.)
 *
 * Trips are walked in start order, ties by id, which is the order they were
 * created in.
 */
export function planRepair(trips: RepairableTrip[], today: string): RepairPlan {
  const work = trips
    .map((t) => ({ ...t }))
    .sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : a.id - b.id));
  const removed = new Set<number>();
  const extended = new Map<number, string | null>();
  const endOf = (t: RepairableTrip) => t.end_date ?? today;
  const touches = (a: RepairableTrip, b: RepairableTrip) => b.start_date <= addDays(endOf(a), 1);

  let changed = true;
  while (changed) {
    changed = false;
    const live = work.filter((t) => !removed.has(t.id));
    for (let i = 0; i < live.length - 1; i++) {
      const a = live[i];
      const b = live[i + 1];

      const sameDates = a.start_date === b.start_date && a.end_date === b.end_date;
      const sameName = a.country_code === b.country_code && a.city.toLowerCase() === b.city.toLowerCase();
      // A one-day fragment next to a stay at the same place is noise whatever
      // the geocoder called it that day ("Ban Kamala" after weeks of "Phuket").
      const dayFragment = spanDays(b, today) <= 1 && sameTripPlace(a, b);
      if ((sameDates && sameTripPlace(a, b)) || ((sameName || dayFragment) && touches(a, b))) {
        const end = a.end_date === null || b.end_date === null ? null : (a.end_date > b.end_date ? a.end_date : b.end_date);
        a.end_date = end;
        extended.set(a.id, end);
        removed.add(b.id);
        changed = true;
        break;
      }

      const c = live[i + 2];
      if (
        c &&
        sameTripPlace(a, c) &&
        !sameTripPlace(a, b) &&
        spanDays(b, today) <= 1 &&
        touches(a, b) &&
        touches(b, c)
      ) {
        removed.add(b.id);
        changed = true;
        break;
      }
    }
  }

  // A trip that was extended and later removed is just removed.
  for (const id of removed) extended.delete(id);
  return {
    extend: [...extended.entries()].map(([id, end_date]) => ({ id, end_date })),
    remove: [...removed],
  };
}
