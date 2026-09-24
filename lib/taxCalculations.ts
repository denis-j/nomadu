import { Trip } from './database';
import { getApplicableTaxRules, type TaxPeriod, type TaxRule } from '../constants/taxRules';
import { countryCodeToFlag } from './geocoding';
import { atNoon, eachDay, fromYmd, toYmd } from './days';

export interface TaxStatus {
  country: string;
  countryCode: string;
  flag: string;
  ruleLabel: string;
  thresholdDays: number;
  daysPresent: number;
  daysRemaining: number;
  percentUsed: number;
  /** The year picked in the app; which stretch that means depends on the country (periodStart, periodEnd). */
  year: number;
  /** First and last day of the stretch counted, YYYY-MM-DD. */
  periodStart: string;
  periodEnd: string;
  /** A fixed tax year, or any window of that length (New Zealand). */
  periodKind: TaxPeriod['kind'];
  status: 'safe' | 'caution' | 'warning' | 'resident';
}

function getStatusFromPercent(percent: number): TaxStatus['status'] {
  if (percent >= 100) return 'resident';
  if (percent > 75) return 'warning';
  if (percent >= 50) return 'caution';
  return 'safe';
}

function getCountryName(trips: Trip[], countryCode: string): string {
  const trip = trips.find((t) => t.country_code === countryCode);
  return trip?.country ?? countryCode;
}

/**
 * Every day spent in a country up to today, as a set of calendar dates.
 *
 * Counted as dates, not in 24-hour steps: stepping from local midnight lost
 * a day across a clock change, 183 days in Thailand came out as 182 in
 * Berlin, London or New York, "warning" instead of "resident". Days after
 * today are not presence yet and are left out.
 */
function presenceDays(trips: Trip[], countryCode: string, today: Date): Set<string> {
  const days = new Set<string>();
  for (const t of trips) {
    if (t.country_code !== countryCode) continue;
    const from = fromYmd(t.start_date);
    const end = t.end_date ? fromYmd(t.end_date) : today;
    eachDay(from, end < today ? end : today, (ymd) => days.add(ymd));
  }
  return days;
}

const monthDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * The tax year that runs on `day`: from the start date on or before it to
 * the day before the next start.
 */
function taxYearAround(period: Extract<TaxPeriod, { kind: 'year' }>, day: Date): { start: Date; end: Date } {
  let startYear = day.getFullYear();
  if (day < new Date(startYear, period.startMonth - 1, period.startDay, 12)) startYear -= 1;
  return {
    start: new Date(startYear, period.startMonth - 1, period.startDay, 12),
    end: new Date(startYear + 1, period.startMonth - 1, period.startDay - 1, 12),
  };
}

const dayNumber = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/**
 * What one country's rule makes of the picked year.
 *
 * A tax year: the one running on December 31 of the picked year, or today
 * in the current year, so a stay that counts right now is always in the
 * default view. For the UK in 2026 that is 6 April 2026 to 5 April 2027;
 * in March 2026 it is the year that started in April 2025.
 *
 * Any 12 months (New Zealand): the busiest window ending on a day spent
 * there in the picked year, since the threshold counts in any such window.
 */
function countFor(rule: TaxRule, days: Set<string>, year: number, today: Date): {
  daysPresent: number;
  periodStart: string;
  periodEnd: string;
  label: string;
} {
  const threshold = `${rule.thresholdDays} days`;
  const { period } = rule;

  if (period.kind === 'year') {
    const reference = year === today.getFullYear() ? today : new Date(year, 11, 31, 12);
    const { start, end } = taxYearAround(period, reference);
    const from = toYmd(start);
    const to = toYmd(end);
    let daysPresent = 0;
    for (const d of days) if (d >= from && d <= to) daysPresent++;
    const calendar = period.startMonth === 1 && period.startDay === 1;
    const label = calendar
      ? `${threshold} in ${start.getFullYear()}`
      : `${threshold} in the ${start.getFullYear()}/${String(end.getFullYear()).slice(2)} tax year (${monthDay(start)} to ${monthDay(end)})`;
    return { daysPresent, periodStart: from, periodEnd: to, label };
  }

  const label = `${threshold} in any ${Math.round(period.days / 30.4)} months`;
  const sorted = [...days].sort();
  const numbers = sorted.map(dayNumber);
  let best = { daysPresent: 0, periodStart: `${year}-01-01`, periodEnd: `${year}-12-31` };
  let first = 0;
  for (let i = 0; i < sorted.length; i++) {
    while (numbers[i] - numbers[first] >= period.days) first++;
    if (!sorted[i].startsWith(`${year}-`)) continue;
    const count = i - first + 1;
    if (count > best.daysPresent) {
      const windowStart = new Date(fromYmd(sorted[i]));
      windowStart.setDate(windowStart.getDate() - (period.days - 1));
      best = { daysPresent: count, periodStart: toYmd(windowStart), periodEnd: sorted[i] };
    }
  }
  return { ...best, label };
}

/**
 * Tax residence status for all relevant countries, each counted over its
 * own stretch of time (see TaxRule): the calendar year for most, the tax
 * year for the UK and Australia, any 12 months for New Zealand. Defaults to
 * the current year. When `hasFixedResidence` is true the citizenship
 * country is excluded.
 */
export function calculateAllTaxStatuses(
  trips: Trip[],
  citizenshipCode: string,
  hasFixedResidence: boolean,
  year: number = new Date().getFullYear(),
  /** "Today" as a local calendar day; the server passes the user's own. */
  today: Date = new Date(),
): TaxStatus[] {
  const day = atNoon(today);
  const visitedCodes = [...new Set(trips.map((t) => t.country_code))];
  const applicableRules = getApplicableTaxRules(citizenshipCode, visitedCodes, hasFixedResidence);

  const statuses: TaxStatus[] = applicableRules
    .map(({ countryCode, rule }) => {
      const { daysPresent, periodStart, periodEnd, label } = countFor(rule, presenceDays(trips, countryCode, day), year, day);
      const daysRemaining = Math.max(0, rule.thresholdDays - daysPresent);
      const percentUsed = rule.thresholdDays > 0 ? (daysPresent / rule.thresholdDays) * 100 : 0;

      return {
        country: getCountryName(trips, countryCode),
        countryCode,
        flag: countryCodeToFlag(countryCode),
        ruleLabel: label,
        thresholdDays: rule.thresholdDays,
        daysPresent,
        daysRemaining,
        percentUsed,
        year,
        periodStart,
        periodEnd,
        periodKind: rule.period.kind,
        status: getStatusFromPercent(percentUsed),
      };
    })
    // Drop countries with zero days in the selected year, keeps the list clean
    .filter((s) => s.daysPresent > 0);

  // Sort by urgency: resident → warning → caution → safe, then by percent desc
  const statusOrder = { resident: 0, warning: 1, caution: 2, safe: 3 };
  statuses.sort((a, b) => {
    const orderDiff = statusOrder[a.status] - statusOrder[b.status];
    if (orderDiff !== 0) return orderDiff;
    return b.percentUsed - a.percentUsed;
  });

  return statuses;
}
