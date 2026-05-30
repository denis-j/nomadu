import { Trip } from './database';
import { getApplicableTaxRules } from '../constants/taxRules';
import { countryCodeToFlag } from './geocoding';
import { tripDaysInYear } from './yearFilter';

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
 */
function countDaysInYear(trips: Trip[], countryCode: string, year: number): number {
  const yearStart = new Date(year, 0, 1).getTime();
  const yearEnd = new Date(year, 11, 31).getTime();

  const uniqueDays = new Set<number>(); // store day-index since epoch
  const msPerDay = 1000 * 60 * 60 * 24;

  for (const t of trips) {
    if (t.country_code !== countryCode) continue;
    const days = tripDaysInYear(t, year);
    if (days <= 0) continue;

    // Walk each day in this trip's clipped range and add to set
    const [ys, ms, ds] = t.start_date.split('-').map(Number);
    const tripStart = new Date(ys, ms - 1, ds).getTime();
    const tripEnd = t.end_date
      ? (() => {
          const [ye, me, de] = t.end_date!.split('-').map(Number);
          return new Date(ye, me - 1, de).getTime();
        })()
      : Date.now();

    const fromMs = Math.max(tripStart, yearStart);
    const toMs = Math.min(tripEnd, yearEnd);
    for (let ms2 = fromMs; ms2 <= toMs; ms2 += msPerDay) {
      uniqueDays.add(Math.floor(ms2 / msPerDay));
    }
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
