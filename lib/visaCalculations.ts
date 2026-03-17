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
 * (unbroken) in a country and count days from entry to today/end_date.
 */
export function countCurrentStayDays(
  trips: Trip[],
  countryCode: string,
): number {
  // Find the most recent trip to this country
  const countryTrips = trips
    .filter((t) => t.country_code === countryCode)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  if (countryTrips.length === 0) return 0;

  const latest = countryTrips[0];
  const tripStart = parseDate(latest.start_date);
  const tripEnd = latest.end_date ? parseDate(latest.end_date) : today();

  return daysBetween(tripStart, tripEnd) + 1;
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
