import { Trip } from './database';
import { getApplicableRules } from '../constants/visaRules';
import { countryCodeToFlag } from './geocoding';
import type { UserVisa } from './userVisas';

export interface VisaStatus {
  destination: string;
  destinationCode: string;
  flag: string;
  ruleLabel: string;
  daysAllowed: number;
  daysUsed: number;
  daysRemaining: number;
  percentUsed: number;
  status: 'ok' | 'warning' | 'critical' | 'exceeded' | 'visa_needed' | 'expired';
  /** Optional URL to verify the rule (e.g. Wikipedia). */
  source?: string;
  /** True when this status was generated from a user-entered visa. */
  isUserVisa?: boolean;
  /** The user_visa row id — set when isUserVisa is true. */
  userVisaId?: number;
  /** YYYY-MM-DD expiry from the user_visa, if applicable. */
  validUntil?: string;
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

// Destination code to human-readable name. Falls back to the ISO code when
// a destination doesn't have an explicit entry, so even rules added later
// without a name still render coherently.
const DESTINATION_NAMES: Record<string, string> = {
  SCHENGEN: 'Schengen Area',
  // Americas
  US: 'United States', CA: 'Canada', MX: 'Mexico', BR: 'Brazil',
  AR: 'Argentina', CL: 'Chile', UY: 'Uruguay', PE: 'Peru', EC: 'Ecuador',
  CO: 'Colombia', CR: 'Costa Rica', PA: 'Panama', DO: 'Dominican Republic',
  // Europe (non-Schengen)
  GB: 'United Kingdom', IE: 'Ireland',
  AL: 'Albania', RS: 'Serbia', ME: 'Montenegro', BA: 'Bosnia and Herzegovina',
  MK: 'North Macedonia', XK: 'Kosovo', TR: 'Turkey',
  GE: 'Georgia', AM: 'Armenia', UA: 'Ukraine', MD: 'Moldova',
  // Asia
  TH: 'Thailand', JP: 'Japan', KR: 'South Korea', ID: 'Indonesia',
  MY: 'Malaysia', SG: 'Singapore', PH: 'Philippines', VN: 'Vietnam',
  TW: 'Taiwan', IN: 'India',
  // Oceania
  AU: 'Australia', NZ: 'New Zealand',
  // Middle East
  AE: 'United Arab Emirates', IL: 'Israel', JO: 'Jordan',
  // Africa
  MA: 'Morocco', EG: 'Egypt', ZA: 'South Africa',
};

function getDestinationName(code: string): string {
  return DESTINATION_NAMES[code] ?? code;
}

function getFlag(code: string): string {
  if (code === 'SCHENGEN') return '🇪🇺';
  return countryCodeToFlag(code);
}

/**
 * Build a VisaStatus from a user-entered visa. Day-counting respects whichever
 * cap the user filled in (rolling window > per-stay > none/expiry-only).
 */
function buildUserVisaStatus(trips: Trip[], uv: UserVisa): VisaStatus {
  const todayStr = today().toISOString().slice(0, 10);
  const isExpired = uv.valid_to < todayStr;

  let daysUsed = 0;
  let daysAllowed = 0;
  let ruleLabel = uv.label;

  if (uv.max_days_per_window && uv.window_days) {
    daysUsed = countDaysInRollingWindow(trips, [uv.country_code], uv.window_days);
    daysAllowed = uv.max_days_per_window;
    ruleLabel = `${uv.label} — ${uv.max_days_per_window}/${uv.window_days}`;
  } else if (uv.max_days_per_stay) {
    daysUsed = countCurrentStayDays(trips, uv.country_code);
    daysAllowed = uv.max_days_per_stay;
    ruleLabel = `${uv.label} — max ${uv.max_days_per_stay}d/stay`;
  }

  const daysRemaining = Math.max(0, daysAllowed - daysUsed);
  const percentUsed = daysAllowed > 0 ? (daysUsed / daysAllowed) * 100 : 0;

  const status: VisaStatus['status'] = isExpired
    ? 'expired'
    : daysAllowed > 0
      ? getStatusFromPercent(percentUsed)
      : 'ok';

  return {
    destination: getDestinationName(uv.country_code),
    destinationCode: uv.country_code,
    flag: getFlag(uv.country_code),
    ruleLabel,
    daysAllowed,
    daysUsed,
    daysRemaining,
    percentUsed,
    status,
    isUserVisa: true,
    userVisaId: uv.id,
    validUntil: uv.valid_to,
  };
}

/**
 * Master function: calculates visa status for all applicable rules. When a
 * user-visa exists for a country, it replaces the default per-country rule
 * (Schengen aggregate is left alone — a national long-stay visa doesn't
 * formally override the 90/180 short-stay rule for other Schengen states).
 */
export function calculateAllVisaStatuses(
  trips: Trip[],
  citizenshipCode: string,
  userVisas: UserVisa[] = [],
): VisaStatus[] {
  const userVisasByCountry = new Map<string, UserVisa>();
  for (const uv of userVisas) userVisasByCountry.set(uv.country_code, uv);

  const visitedCodes = [...new Set(trips.map((t) => t.country_code))];
  const applicableRules = getApplicableRules(citizenshipCode, visitedCodes);

  // Default per-destination statuses, skipping anything the user has a visa for.
  const statuses: VisaStatus[] = applicableRules
    .filter((ar) => !userVisasByCountry.has(ar.destinationCode))
    .map((ar) => {
    const { rule, countryCodes, destinationCode } = ar;

    // 'visa_required' rules are surfaced as a passive "Visa needed" card —
    // we can't auto-track usage, so daysUsed/Allowed/Remaining are zeroed.
    if (rule.ruleType === 'visa_required') {
      return {
        destination: getDestinationName(destinationCode),
        destinationCode,
        flag: getFlag(destinationCode),
        ruleLabel: rule.label,
        daysAllowed: 0,
        daysUsed: 0,
        daysRemaining: 0,
        percentUsed: 0,
        status: 'visa_needed' as const,
        source: rule.source,
      };
    }

    const daysUsed = rule.ruleType === 'rolling_window'
      ? countDaysInRollingWindow(trips, countryCodes, rule.windowDays)
      : countCurrentStayDays(trips, destinationCode);

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
      source: rule.source,
    };
  });

  // User-entered visas always get a card, even with no trips yet — so the
  // user can see expiry and refresh from any tab.
  for (const uv of userVisas) {
    if (uv.country_code === citizenshipCode) continue;
    statuses.push(buildUserVisaStatus(trips, uv));
  }

  // Sort by urgency: expired → exceeded → critical → warning → ok → visa_needed,
  // then by percent desc within each bucket.
  const statusOrder = { expired: 0, exceeded: 1, critical: 2, warning: 3, ok: 4, visa_needed: 5 };
  statuses.sort((a, b) => {
    const orderDiff = statusOrder[a.status] - statusOrder[b.status];
    if (orderDiff !== 0) return orderDiff;
    return b.percentUsed - a.percentUsed;
  });

  return statuses;
}
