import { Trip, parseDate } from './database';

/**
 * `null` means "All Time" (no filter). A number is a 4-digit calendar year.
 */
export type YearFilter = number | null;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Returns the number of days a trip overlaps with the given calendar year.
 * For ongoing trips (no end_date), uses today as the end date.
 * Counts each day in [start, end] inclusively.
 */
export function tripDaysInYear(trip: Trip, year: number): number {
  const tripStart = startOfDay(parseDate(trip.start_date));
  const tripEnd = startOfDay(trip.end_date ? parseDate(trip.end_date) : new Date());

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);

  const overlapStart = tripStart > yearStart ? tripStart : yearStart;
  const overlapEnd = tripEnd < yearEnd ? tripEnd : yearEnd;

  if (overlapStart > overlapEnd) return 0;

  return Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / MS_PER_DAY) + 1;
}

/**
 * Effective day count for a trip given a year filter. When filter is `null`
 * we return the trip's stored `days` (all-time behaviour); when filter is a
 * year we clip to that calendar year.
 */
export function effectiveTripDays(trip: Trip, year: YearFilter): number {
  if (year === null) return trip.days;
  return tripDaysInYear(trip, year);
}

/**
 * Sorted list of years that have trip data, newest first. Always includes the
 * current calendar year even if there are no trips yet, so the picker isn't
 * empty on a fresh account.
 */
export function availableYearsFromTrips(trips: Trip[]): number[] {
  const years = new Set<number>();
  const currentYear = new Date().getFullYear();
  years.add(currentYear);
  for (const t of trips) {
    const start = parseDate(t.start_date).getFullYear();
    const end = t.end_date ? parseDate(t.end_date).getFullYear() : currentYear;
    for (let y = start; y <= end; y++) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}
