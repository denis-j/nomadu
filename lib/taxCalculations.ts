import { Trip } from './database';
import { getApplicableTaxRules } from '../constants/taxRules';
import { countryCodeToFlag } from './geocoding';
import { eachDay, fromYmd } from './days';

export interface TaxStatus {
  country: string;
  countryCode: string;
  flag: string;
  ruleLabel: string;
  thresholdDays: number;
  daysPresent: number;
  daysRemaining: number;
  percentUsed: number;
  /** The calendar year the count applies to. */
  year: number;
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
 * Total days a user spent in a country within a given calendar year.
 * Deduplicates overlapping/adjacent trips so we never double-count a day.
 *
 * Counted as a set of calendar dates. The previous loop stepped from local
 * midnight in fixed 24-hour jumps and keyed on a UTC day number, so across a
 * clock change it lost a day: 183 days in Thailand came out as 182 in
 * Berlin, London or New York, "warning" instead of "resident". Days after
 * today are not presence yet and are left out.
 */
function countDaysInYear(trips: Trip[], countryCode: string, year: number): number {
  const today = new Date();
  const yearStart = new Date(year, 0, 1, 12);
  const yearEnd = new Date(year, 11, 31, 12);
  const uniqueDays = new Set<string>();

  for (const t of trips) {
    if (t.country_code !== countryCode) continue;
    const tripStart = fromYmd(t.start_date);
    const tripEnd = t.end_date ? fromYmd(t.end_date) : today;
    const from = tripStart > yearStart ? tripStart : yearStart;
    const endCap = tripEnd < yearEnd ? tripEnd : yearEnd;
    const to = endCap < today ? endCap : today;
    eachDay(from, to, (ymd) => uniqueDays.add(ymd));
  }

  return uniqueDays.size;
}

/**
 * Calculate tax residence status for all relevant countries against a single
 * calendar year. Defaults to the current year. When `hasFixedResidence` is true
 * the citizenship country is excluded.
 */
export function calculateAllTaxStatuses(
  trips: Trip[],
  citizenshipCode: string,
  hasFixedResidence: boolean,
  year: number = new Date().getFullYear(),
): TaxStatus[] {
  const visitedCodes = [...new Set(trips.map((t) => t.country_code))];
  const applicableRules = getApplicableTaxRules(citizenshipCode, visitedCodes, hasFixedResidence);

  const statuses: TaxStatus[] = applicableRules
    .map(({ countryCode, rule }) => {
      const daysPresent = countDaysInYear(trips, countryCode, year);
      const daysRemaining = Math.max(0, rule.thresholdDays - daysPresent);
      const percentUsed = rule.thresholdDays > 0 ? (daysPresent / rule.thresholdDays) * 100 : 0;

      return {
        country: getCountryName(trips, countryCode),
        countryCode,
        flag: countryCodeToFlag(countryCode),
        ruleLabel: rule.label.replace('{year}', String(year)),
        thresholdDays: rule.thresholdDays,
        daysPresent,
        daysRemaining,
        percentUsed,
        year,
        status: getStatusFromPercent(percentUsed),
      };
    })
    // Drop countries with zero days in the selected year — keeps the list clean
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
