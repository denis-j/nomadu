import { countDays, eachDay, fromYmd } from './days';

/**
 * The numbers on the Tracking screen, computed from a list of trips.
 *
 * Pure so the same arithmetic runs on the phone (over SQLite rows) and on the
 * server (over the synced Firestore copy) for an agent asking "how much was I
 * away this year". Days are calendar days, counted once however many trips
 * overlap them.
 */

export interface StatsTrip {
  city: string;
  country: string;
  country_code: string;
  start_date: string;
  end_date: string | null;
}

export interface Stats {
  /** Countries and cities with at least one day inside the window. */
  totalCountries: number;
  totalCities: number;
  /**
   * Distinct days spent outside the home country.
   *
   * The headline figure, and the only day count here that says anything about
   * how someone travelled. "Days tracked" cannot: a person is always
   * somewhere, so that number either equals the days elapsed or reveals a gap
   * in the location history, and neither is an achievement.
   */
  daysAway: number;
  /** Coverage. Shown as a quiet data-quality line, not as a score. */
  daysTracked: number;
  daysInWindow: number;
  /** Separate stays in the window, and the average length of one. */
  stops: number;
  avgStayDays: number;
  /** Countries in this window that had never been visited before it. */
  newCountries: number;
  /** Distinct days per country, biggest first. */
  topCountries: { country: string; country_code: string; days: number }[];
  availableYears: number[];
  allTimeCountryCodes: string[];
  /** Twelve buckets for a year, null for all time. */
  daysAwayByMonth: number[] | null;
}

export function statsFromTrips(
  trips: StatsTrip[],
  year: number | null,
  homeCountryCode: string | null,
  availableYears: number[],
  now: Date = new Date(),
): Stats {
  const home = homeCountryCode ? homeCountryCode.toUpperCase() : null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const windowStart = year === null ? null : new Date(year, 0, 1);
  let windowEnd = today;
  if (year !== null) {
    const yearEnd = new Date(year, 11, 31);
    windowEnd = yearEnd < today ? yearEnd : today;
  }

  const trackedDays = new Set<string>();
  const awayDays = new Set<string>();
  const perCountry = new Map<string, { country: string; days: Set<string> }>();
  const countryNames = new Set<string>();
  const cities = new Set<string>();
  const codesInWindow = new Set<string>();
  const codesBefore = new Set<string>();
  const stayLengths = new Map<string, number>();
  let earliestStart: Date | null = null;

  for (const trip of trips) {
    const code = trip.country_code.toUpperCase();
    const start = fromYmd(trip.start_date);
    const end = trip.end_date ? fromYmd(trip.end_date) : today;
    if (!earliestStart || start < earliestStart) earliestStart = start;

    if (windowStart && start < windowStart) codesBefore.add(code);
    if (windowStart && end < windowStart) continue;
    if (start > windowEnd) continue;

    const from = windowStart && start < windowStart ? windowStart : start;
    const to = end > windowEnd ? windowEnd : end;
    if (from > to) continue;

    countryNames.add(trip.country);
    cities.add(`${trip.city}|${trip.country}`);
    codesInWindow.add(code);

    // Exact duplicates are one stay, not two.
    const stayKey = `${trip.city}|${code}|${trip.start_date}|${trip.end_date ?? ''}`;
    if (!stayLengths.has(stayKey)) stayLengths.set(stayKey, countDays(from, to));

    let bucket = perCountry.get(code);
    if (!bucket) {
      bucket = { country: trip.country, days: new Set<string>() };
      perCountry.set(code, bucket);
    }

    eachDay(from, to, (day) => {
      trackedDays.add(day);
      bucket!.days.add(day);
      if (!home || code !== home) awayDays.add(day);
    });
  }

  const monthBuckets = year === null ? null : new Array<number>(12).fill(0);
  if (monthBuckets) {
    for (const day of awayDays) monthBuckets[Number(day.slice(5, 7)) - 1] += 1;
  }

  const topCountries = [...perCountry.entries()]
    .map(([country_code, b]) => ({ country: b.country, country_code, days: b.days.size }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 10);

  const stays = [...stayLengths.values()];
  const rangeStart = windowStart ?? earliestStart;

  return {
    totalCountries: countryNames.size,
    totalCities: cities.size,
    daysAway: awayDays.size,
    daysTracked: trackedDays.size,
    daysInWindow: rangeStart ? countDays(rangeStart, windowEnd) : 0,
    stops: stays.length,
    avgStayDays: stays.length
      ? Math.round(stays.reduce((sum, d) => sum + d, 0) / stays.length)
      : 0,
    newCountries: [...codesInWindow].filter((c) => !codesBefore.has(c)).length,
    topCountries,
    availableYears,
    allTimeCountryCodes: [...new Set(trips.map((t) => t.country_code.toUpperCase()))],
    daysAwayByMonth: monthBuckets,
  };
}
