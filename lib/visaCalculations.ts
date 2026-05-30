import { Trip } from './database';
import { getApplicableRules, ApplicableRule } from '../constants/visaRules';
import { countryCodeToFlag } from './geocoding';

export interface VisaStatus {
  destination: string;
  destinationCode: string;
  flag: string;
  ruleLabel: string;
  daysAllowed: number;
  daysUsed: number;
  daysRemaining: number;
  percentUsed: number;
  status: 'ok' | 'warning' | 'critical' | 'exceeded';
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Count days spent in any of the given country codes within a rolling window
 * ending at refDate. Window starts at refDate - (windowDays - 1).
 */
export function countDaysInRollingWindow(
  trips: Trip[],
  countryCodes: string[],
  windowDays: number,
  refDate: Date = today(),
): number {
  const codesSet = new Set(countryCodes);
  const windowStart = new Date(refDate);
  windowStart.setDate(windowStart.getDate() - (windowDays - 1));

  // Use a Set to deduplicate days across overlapping/adjacent trips
  const uniqueDays = new Set<string>();

  for (const trip of trips) {
    if (!codesSet.has(trip.country_code)) continue;

    const tripStart = parseDate(trip.start_date);
    const tripEnd = trip.end_date ? parseDate(trip.end_date) : today();

    const overlapStart = tripStart > windowStart ? tripStart : new Date(windowStart);
    const overlapEnd = tripEnd < refDate ? tripEnd : new Date(refDate);

    if (overlapStart <= overlapEnd) {
      const cursor = new Date(overlapStart);
      while (cursor <= overlapEnd) {
        uniqueDays.add(
          `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`,
        );
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }

  return uniqueDays.size;
}

/**
 * For simple visa-free rules: find the most recent continuous stay
 * in a country and count total days. A stay is "continuous" as long as
 * there is no gap of 1+ days outside the country between trips.
 * This handles multiple cities within the same country correctly —
 * the visa only resets on a border run (leaving the country for ≥1 day).
 */
export function countCurrentStayDays(
  trips: Trip[],
  countryCode: string,
): number {
  // Get all trips to this country, sorted chronologically (newest first)
  const countryTrips = trips
    .filter((t) => t.country_code === countryCode)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  if (countryTrips.length === 0) return 0;

  // Start from the most recent trip and walk backwards,
  // collecting all consecutive trips with no gap > 0 days between them.
  // Use a Set of unique days to handle overlapping trips correctly.
  const uniqueDays = new Set<string>();

  const addTripDays = (start: Date, end: Date) => {
    const cursor = new Date(start);
    while (cursor <= end) {
      uniqueDays.add(
        `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`,
      );
      cursor.setDate(cursor.getDate() + 1);
    }
  };

  // Add days from the most recent trip
  let earliestDate = parseDate(countryTrips[0].start_date);
  const latestEnd = countryTrips[0].end_date
    ? parseDate(countryTrips[0].end_date)
    : today();
  addTripDays(earliestDate, latestEnd);

  // Walk backwards through remaining trips — merge if no gap
  for (let i = 1; i < countryTrips.length; i++) {
    const tripEnd = countryTrips[i].end_date
      ? parseDate(countryTrips[i].end_date)
      : today();
    const tripStart = parseDate(countryTrips[i].start_date);

    // Check if this trip connects to the current continuous stay.
    // "Connects" means the trip's end_date is at most 1 day before
    // the earliest start we've seen (no full day gap between them).
    const gapDays = daysBetween(tripEnd, earliestDate);
    if (gapDays <= 1) {
      // Connected — add these days and extend the earliest date
      addTripDays(tripStart, tripEnd);
      if (tripStart < earliestDate) {
        earliestDate = tripStart;
      }
    } else {
      // Gap found — border run, stop merging
      break;
    }
  }

  return uniqueDays.size;
}

function getStatusFromPercent(percent: number): VisaStatus['status'] {
  if (percent > 100) return 'exceeded';
  if (percent > 85) return 'critical';
  if (percent > 67) return 'warning';
  return 'ok';
}

// Destination code to human-readable name
const DESTINATION_NAMES: Record<string, string> = {
  SCHENGEN: 'Schengen Area',
  TH: 'Thailand', JP: 'Japan', US: 'United States', GB: 'United Kingdom',
  AU: 'Australia', ID: 'Indonesia', MX: 'Mexico', KR: 'South Korea',
  CO: 'Colombia', GE: 'Georgia', TR: 'Turkey', ME: 'Montenegro',
  RS: 'Serbia', AL: 'Albania', BR: 'Brazil',
};

function getDestinationName(code: string): string {
  return DESTINATION_NAMES[code] ?? code;
}

function getFlag(code: string): string {
  if (code === 'SCHENGEN') return '🇪🇺';
  return countryCodeToFlag(code);
}

/**
 * Master function: calculates visa status for all applicable rules.
 */
export function calculateAllVisaStatuses(
  trips: Trip[],
  citizenshipCode: string,
): VisaStatus[] {
  const visitedCodes = [...new Set(trips.map((t) => t.country_code))];
  const applicableRules = getApplicableRules(citizenshipCode, visitedCodes);

  const statuses: VisaStatus[] = applicableRules.map((ar) => {
    const { rule, countryCodes, destinationCode } = ar;
    let daysUsed: number;

    if (rule.ruleType === 'rolling_window') {
      daysUsed = countDaysInRollingWindow(trips, countryCodes, rule.windowDays);
    } else {
      // visa_free: count current/most recent stay
      daysUsed = countCurrentStayDays(trips, destinationCode);
    }

    const daysRemaining = Math.max(0, rule.allowedDays - daysUsed);
    const percentUsed = rule.allowedDays > 0 ? (daysUsed / rule.allowedDays) * 100 : 0;

    return {
      destination: getDestinationName(destinationCode),
      destinationCode,
      flag: getFlag(destinationCode),
      ruleLabel: rule.label,
      daysAllowed: rule.allowedDays,
      daysUsed,
      daysRemaining,
      percentUsed,
      status: getStatusFromPercent(percentUsed),
    };
  });

  // Sort by urgency: exceeded → critical → warning → ok, then by percent desc
  const statusOrder = { exceeded: 0, critical: 1, warning: 2, ok: 3 };
  statuses.sort((a, b) => {
    const orderDiff = statusOrder[a.status] - statusOrder[b.status];
    if (orderDiff !== 0) return orderDiff;
    return b.percentUsed - a.percentUsed;
  });

  return statuses;
}
