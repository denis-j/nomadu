import { Trip } from './database';
import { getApplicableRules } from '../constants/visaRules';
import { countryCodeToFlag } from './geocoding';
import { getCountryName } from '../utils/geography';
import { eachDay, toYmd } from './days';
import type { EntriesAllowed, UserVisa } from './userVisas';

/**
 * Which of the Visa tab's three groups a status belongs to: running now, an
 * expired visa of your own, or a country you have since left. Shared with
 * the Tracking tab, whose card used to show the most urgent status of all,
 * and "most urgent" sorts an expired visa first.
 */
export type VisaGroup = 'active' | 'expiredVisa' | 'pastCountry';

export function visaGroup(visa: VisaStatus): VisaGroup {
  if (visa.isUserVisa) {
    return visa.status === 'expired' ? 'expiredVisa' : 'active';
  }
  // An auto rule whose stay is over: you were there, you are not now.
  return visa.leftOn && visa.daysUsed === 0 ? 'pastCountry' : 'active';
}

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
  /** Optional URL to verify the rule (e.g. Wikipedia, embassy). */
  source?: string;
  /** YYYY-MM-DD, when the underlying rule was last audited. */
  lastVerified?: string;
  /** True when this status was generated from a user-entered visa. */
  isUserVisa?: boolean;
  /** The user_visa row id, set when isUserVisa is true. */
  userVisaId?: number;
  /** YYYY-MM-DD expiry from the user_visa, if applicable. */
  validUntil?: string;
  /**
   * Per-stay rules only. Days of the most recent *finished* stay, together
   * with the day the traveller left. Set when `daysUsed` is 0 because the
   * stay is over, so the card can say "21 of 30 days, left on 2024-10-28"
   * instead of pretending the counter is still running.
   */
  lastStayDays?: number;
  leftOn?: string;
  /**
   * Identifies the period `daysUsed` belongs to: the start date of the running
   * stay for per-stay rules, the calendar year for rolling windows. Usage
   * warnings are de-duplicated per period, so leaving and re-entering a country
   * arms the warnings again.
   */
  usagePeriod: string;
  /** User-visas only: how many entries the visa permits. */
  entriesAllowed?: EntriesAllowed;
  /** User-visas only: a single-entry visa that was spent by leaving the country. */
  singleEntryUsed?: boolean;
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

export { toYmd };

export function todayStr(): string {
  return toYmd(today());
}

/**
 * Count days spent in any of the given country codes within a rolling window
 * ending at refDate. Window starts at refDate - (windowDays - 1).
 *
 * `notBefore` clamps the window to a user-visa's `valid_from`, so days spent
 * in the country before the visa was issued don't eat its allowance.
 */
export function countDaysInRollingWindow(
  trips: Trip[],
  countryCodes: string[],
  windowDays: number,
  refDate: Date = today(),
  notBefore?: string,
  /** Days that do not count, e.g. covered by a national visa of that country. */
  exclude?: (countryCode: string, ymd: string) => boolean,
): number {
  const codesSet = new Set(countryCodes);
  const windowStart = new Date(refDate);
  windowStart.setDate(windowStart.getDate() - (windowDays - 1));

  if (notBefore) {
    const floor = parseDate(notBefore);
    if (floor > windowStart) windowStart.setTime(floor.getTime());
  }

  // Use a Set to deduplicate days across overlapping/adjacent trips
  const uniqueDays = new Set<string>();

  for (const trip of trips) {
    if (!codesSet.has(trip.country_code)) continue;

    const tripStart = parseDate(trip.start_date);
    const tripEnd = trip.end_date ? parseDate(trip.end_date) : refDate;

    const overlapStart = tripStart > windowStart ? tripStart : new Date(windowStart);
    const overlapEnd = tripEnd < refDate ? tripEnd : new Date(refDate);

    if (overlapStart <= overlapEnd) {
      eachDay(overlapStart, overlapEnd, (day) => {
        if (!exclude?.(trip.country_code, day)) uniqueDays.add(day);
      });
    }
  }

  return uniqueDays.size;
}

/**
 * Days a national visa or residence permit covers, per country.
 *
 * Time spent in a Schengen state on that state's own long-stay visa (a
 * Spanish digital nomad visa, a German residence permit) does not count
 * toward the 90/180 short-stay rule; days in the other member states still
 * do. Counting them sent a US citizen living in Spain on a D visa an overstay
 * warning. A visa the user entered with its own 90/180 window is a
 * short-stay visa and is left out of this.
 */
function nationalVisaCover(userVisas: UserVisa[]): (countryCode: string, ymd: string) => boolean {
  const ranges = userVisas
    .filter((uv) => !uv.deleted && !(uv.max_days_per_window && uv.window_days))
    .map((uv) => ({ code: uv.country_code, from: uv.valid_from, to: uv.valid_to }));
  return (countryCode, ymd) => ranges.some((r) => r.code === countryCode && ymd >= r.from && ymd <= r.to);
}

/** One trip reduced to the country and the days it covers, clamped to today. */
export interface TravelSpan {
  code: string;
  start: Date;
  end: Date;
}

/**
 * All trips as parsed, date-sorted spans.
 *
 * Built once per calculation and handed to every `getCurrentStay` call, which
 * is what keeps the border-crossing check cheap: building it per country
 * re-parsed every date once per country, and a traveller with forty countries
 * paid for that forty times over.
 */
export function buildTravelSpans(trips: Trip[], refDate: Date = today()): TravelSpan[] {
  const spans: TravelSpan[] = [];
  for (const trip of trips) {
    const start = parseDate(trip.start_date);
    if (start > refDate) continue;
    const rawEnd = trip.end_date ? parseDate(trip.end_date) : refDate;
    const end = rawEnd > refDate ? new Date(refDate) : rawEnd;
    if (end < start) continue;
    spans.push({ code: trip.country_code, start, end });
  }
  spans.sort((a, b) => a.start.getTime() - b.start.getTime());
  return spans;
}

/**
 * Was the traveller in a country other than `countryCode` on any day in
 * [from, to]?
 *
 * This is what separates a move from Bangkok to Chiang Mai from a visa run to
 * Penang and back: two trips to the same country sitting next to each other on
 * the calendar look identical until you check what covers the day between them.
 */
function wasAbroadBetween(
  spans: TravelSpan[],
  countryCode: string,
  from: Date,
  to: Date,
): boolean {
  const lo = from < to ? from : to;
  const hi = from < to ? to : from;
  for (const span of spans) {
    if (span.start > hi) return false; // sorted by start, nothing later overlaps
    if (span.code === countryCode) continue;
    if (span.end >= lo) return true;
  }
  return false;
}

/**
 * The stay a per-stay rule is currently counting against.
 *
 * `days` is only non-zero while the traveller is actually in the country. Once
 * they have left, the allowance resets on the next entry, so the running count
 * is 0 and the finished stay is reported separately.
 */
export interface CurrentStay {
  /** Days of the stay that is still running. 0 once the traveller has left. */
  days: number;
  /** YYYY-MM-DD the running stay began, null when none is running. */
  since: string | null;
  /** Days of the most recent finished stay. 0 when there never was one. */
  lastStayDays: number;
  /** YYYY-MM-DD of its last day, null while the stay is still running. */
  leftOn: string | null;
}

/**
 * Longest stretch without any location data that still counts as staying.
 * Gaps are common (phone off, indoors, tracking paused), and treating each as
 * "left the country" handed out a fresh allowance for nothing: Thailand from
 * 1 to 28 March and again from 30 March read as 7 days instead of 35.
 * Longer silences are more likely a trip that was not recorded.
 */
const MAX_UNTRACKED_GAP_DAYS = 14;

/**
 * Find the most recent continuous stay in a country and count its days.
 *
 * A per-stay allowance is really a per-*entry* allowance: leaving and coming
 * back gets you a fresh stamp and a fresh count. That is what a visa run is,
 * and in Southeast Asia it works even when you are only gone for an afternoon.
 * So the stay ends at any recorded border crossing, not only when a full day
 * was spent abroad. Countries where a quick exit does NOT buy a new allowance
 * are the ones with an annual or rolling cap (Schengen 90/180, Canada
 * 180/365), and those are `rolling_window` rules that never reach this
 * function.
 *
 * Two trips to the same country therefore merge unless something sits
 * between them: a recorded trip abroad, or a gap without data longer than
 * `MAX_UNTRACKED_GAP_DAYS`. A shorter gap counts as days in the country:
 * the traveller was most likely still there, and assuming otherwise is the
 * error that ends in an overstay.
 *
 * Two boundaries matter beyond that. Trips that start after `refDate` are
 * ignored and open-ended trips stop counting at `refDate`, so a journey
 * planned for next year doesn't show up as days already spent. And
 * `notBefore` clamps counting to a user-visa's `valid_from`.
 */
export function getCurrentStay(
  trips: Trip[],
  countryCode: string,
  refDate: Date = today(),
  notBefore?: string,
  travelSpans?: TravelSpan[],
): CurrentStay {
  const none: CurrentStay = { days: 0, since: null, lastStayDays: 0, leftOn: null };

  const floor = notBefore ? parseDate(notBefore) : null;

  const countryTrips = trips
    .filter((t) => t.country_code === countryCode && parseDate(t.start_date) <= refDate)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  if (countryTrips.length === 0) return none;

  /** End of a trip, never past today: an open end means "still going". */
  const endOf = (t: Trip): Date => {
    const end = t.end_date ? parseDate(t.end_date) : refDate;
    return end > refDate ? new Date(refDate) : end;
  };
  /** Start of a trip, never before the visa became valid. */
  const startOf = (t: Trip): Date => {
    const start = parseDate(t.start_date);
    return floor && start < floor ? new Date(floor) : start;
  };

  const uniqueDays = new Set<string>();
  const addDays = (start: Date, end: Date) => {
    eachDay(start, end, (day) => uniqueDays.add(day));
  };

  const abroad = travelSpans ?? buildTravelSpans(trips, refDate);

  const newest = countryTrips[0];
  let blockEnd = endOf(newest);
  let blockStart = startOf(newest);
  // Tracked unclamped, because whether two trips connect is a fact about the
  // journey, not about when a visa happens to have been issued.
  let earliest = parseDate(newest.start_date);
  addDays(blockStart, blockEnd);

  for (let i = 1; i < countryTrips.length; i++) {
    const trip = countryTrips[i];
    const tripEnd = endOf(trip);
    const tripStart = parseDate(trip.start_date);

    // A long silence: probably an unrecorded trip, allowance resets.
    if (daysBetween(tripEnd, earliest) > MAX_UNTRACKED_GAP_DAYS + 1) break;
    // A recorded trip abroad in between: visa run, allowance resets even if
    // they were back the same day.
    if (wasAbroadBetween(abroad, countryCode, tripEnd, earliest)) break;
    // Everything from here on lies before the visa was issued.
    if (floor && tripEnd < floor) break;

    addDays(startOf(trip), tripEnd);
    // The untracked days in between count as spent here.
    const gapStart = new Date(tripEnd);
    gapStart.setDate(gapStart.getDate() + 1);
    const gapEnd = new Date(earliest);
    gapEnd.setDate(gapEnd.getDate() - 1);
    if (gapStart <= gapEnd) addDays(floor && gapStart < floor ? new Date(floor) : gapStart, gapEnd);
    if (tripEnd > blockEnd) blockEnd = tripEnd;
    if (startOf(trip) < blockStart) blockStart = startOf(trip);
    if (tripStart < earliest) earliest = tripStart;
  }

  if (uniqueDays.size === 0) return none;

  // Still in the country only if the block reaches today.
  if (blockEnd >= refDate) {
    return { days: uniqueDays.size, since: toYmd(blockStart), lastStayDays: 0, leftOn: null };
  }
  return { days: 0, since: null, lastStayDays: uniqueDays.size, leftOn: toYmd(blockEnd) };
}

/** Period marker for rolling windows; see `runUsageThresholdCheck`. */
export const ROLLING_PERIOD = 'rolling';

function getStatusFromPercent(percent: number): VisaStatus['status'] {
  if (percent > 100) return 'exceeded';
  if (percent > 85) return 'critical';
  if (percent > 67) return 'warning';
  return 'ok';
}

// Destination code to human-readable name. Curated entries win because they
// are what earlier versions displayed; everything else comes from the GeoNames
// table, which covers all 250 codes. A user-visa for Spain used to render as
// "ES" because Schengen members were never in this map.
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
  return DESTINATION_NAMES[code] ?? getCountryName(code) ?? code;
}

function getFlag(code: string): string {
  if (code === 'SCHENGEN') return '🇪🇺';
  return countryCodeToFlag(code);
}

/**
 * Build a VisaStatus from a user-entered visa. Day-counting respects whichever
 * cap the user filled in (rolling window > per-stay > none/expiry-only) and
 * never reaches back past the visa's own `valid_from`.
 */
function buildUserVisaStatus(
  trips: Trip[],
  uv: UserVisa,
  refDate: Date,
  travelSpans: TravelSpan[],
): VisaStatus {
  const isExpired = uv.valid_to < toYmd(refDate);

  let daysUsed = 0;
  let daysAllowed = 0;
  let ruleLabel = uv.label;
  let stay: CurrentStay | null = null;

  if (uv.max_days_per_window && uv.window_days) {
    daysUsed = countDaysInRollingWindow(
      trips, [uv.country_code], uv.window_days, refDate, uv.valid_from,
    );
    daysAllowed = uv.max_days_per_window;
    ruleLabel = `${uv.label} · ${uv.max_days_per_window}/${uv.window_days}`;
  } else if (uv.max_days_per_stay) {
    stay = getCurrentStay(trips, uv.country_code, refDate, uv.valid_from, travelSpans);
    daysUsed = stay.days;
    daysAllowed = uv.max_days_per_stay;
    ruleLabel = `${uv.label} · max ${uv.max_days_per_stay}d/stay`;
  } else {
    // No day cap, but a single-entry visa still needs to know about the exit.
    stay = getCurrentStay(trips, uv.country_code, refDate, uv.valid_from, travelSpans);
  }

  // A single-entry visa is spent the moment the holder leaves the country.
  const singleEntryUsed =
    uv.entries_allowed === 'single' && !!stay && stay.leftOn !== null;

  const daysRemaining = Math.max(0, daysAllowed - daysUsed);
  const percentUsed = daysAllowed > 0 ? (daysUsed / daysAllowed) * 100 : 0;

  const status: VisaStatus['status'] = isExpired || singleEntryUsed
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
    entriesAllowed: uv.entries_allowed,
    ...(singleEntryUsed ? { singleEntryUsed: true } : {}),
    ...(stay && stay.leftOn
      ? { lastStayDays: stay.lastStayDays, leftOn: stay.leftOn }
      : {}),
    // Keyed per visa row so a renewal for the same country warns again.
    usagePeriod: uv.max_days_per_window && uv.window_days
      ? `uv${uv.id}-${ROLLING_PERIOD}`
      : stay?.since ?? `uv${uv.id}-${refDate.getFullYear()}`,
  };
}

/**
 * Master function: calculates visa status for all applicable rules. When a
 * *still valid* user-visa exists for a country, it replaces the citizenship
 * default for that country. An expired one keeps its own card but must not
 * hide the rule that applies once it has run out, otherwise leaving an old
 * visa in the list silently switches off tracking for that country.
 *
 * The Schengen aggregate is left alone either way: a national long-stay visa
 * doesn't formally override the 90/180 short-stay rule for other member states.
 */
export function calculateAllVisaStatuses(
  trips: Trip[],
  citizenshipCode: string,
  userVisas: UserVisa[] = [],
): VisaStatus[] {
  const refDate = today();
  const ymdToday = toYmd(refDate);
  const year = refDate.getFullYear();
  const travelSpans = buildTravelSpans(trips, refDate);

  // Only a visa that is valid today replaces the default rule. One that
  // starts next month used to switch tracking off now: a traveller at day 54
  // of 60 read as 0 of 180 because their DTV begins in October.
  const supersededCountries = new Set(
    userVisas
      .filter((uv) => !uv.deleted && uv.valid_from <= ymdToday && uv.valid_to >= ymdToday)
      .map((uv) => uv.country_code),
  );
  const coveredByNationalVisa = nationalVisaCover(userVisas);

  const visitedCodes = [...new Set(trips.map((t) => t.country_code))];
  const applicableRules = getApplicableRules(citizenshipCode, visitedCodes);

  // Default per-destination statuses, skipping anything covered by a live visa.
  const statuses: VisaStatus[] = applicableRules
    .filter((ar) => !supersededCountries.has(ar.destinationCode))
    .map((ar) => {
    const { rule, countryCodes, destinationCode } = ar;

    // 'visa_required' rules are surfaced as a passive "Visa needed" card:
    // we can't auto-track usage, so daysUsed/Allowed/Remaining are zeroed. The
    // stay is still resolved, purely so the screen can tell "you are there and
    // need a visa" apart from "you went there once in 2019".
    if (rule.ruleType === 'visa_required') {
      const past = getCurrentStay(trips, destinationCode, refDate, undefined, travelSpans);
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
        lastVerified: rule.lastVerified,
        ...(past.leftOn ? { lastStayDays: past.lastStayDays, leftOn: past.leftOn } : {}),
        usagePeriod: String(year),
      };
    }

    let daysUsed: number;
    let stay: CurrentStay | null = null;

    if (rule.ruleType === 'rolling_window') {
      daysUsed = countDaysInRollingWindow(
        trips, countryCodes, rule.windowDays, refDate, undefined,
        destinationCode === 'SCHENGEN' ? coveredByNationalVisa : undefined,
      );
    } else {
      stay = getCurrentStay(trips, destinationCode, refDate, undefined, travelSpans);
      daysUsed = stay.days;
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
      source: rule.source,
      lastVerified: rule.lastVerified,
      ...(stay && stay.leftOn
        ? { lastStayDays: stay.lastStayDays, leftOn: stay.leftOn }
        : {}),
      // A rolling window has no calendar period: its warnings re-arm when
      // the count drops below the threshold again (see notifications.ts).
      // Tied to the year, a second stretch over the limit in the same year
      // went unwarned and old warnings fired again on 1 January.
      usagePeriod: rule.ruleType === 'rolling_window' ? ROLLING_PERIOD : stay?.since ?? String(year),
    };
  });

  // User-entered visas always get a card, even with no trips yet, so the
  // user can see expiry and refresh from any tab.
  for (const uv of userVisas) {
    if (uv.country_code === citizenshipCode) continue;
    statuses.push(buildUserVisaStatus(trips, uv, refDate, travelSpans));
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
