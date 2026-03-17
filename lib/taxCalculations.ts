import { Trip } from './database';
import { countDaysInRollingWindow } from './visaCalculations';
import { getApplicableTaxRules } from '../constants/taxRules';
import { countryCodeToFlag } from './geocoding';

export interface TaxStatus {
  country: string;
  countryCode: string;
  flag: string;
  ruleLabel: string;
  thresholdDays: number;
  daysPresent: number;
  daysRemaining: number;
  percentUsed: number;
  status: 'safe' | 'caution' | 'warning' | 'resident';
}

function getStatusFromPercent(percent: number): TaxStatus['status'] {
  if (percent >= 100) return 'resident';
  if (percent > 75) return 'warning';
  if (percent >= 50) return 'caution';
  return 'safe';
}

/**
 * Derive a country name from trip data.
 */
function getCountryName(trips: Trip[], countryCode: string): string {
  const trip = trips.find((t) => t.country_code === countryCode);
  return trip?.country ?? countryCode;
}

/**
 * Calculate tax residence status for all relevant countries.
 * When hasFixedResidence is true, the home country is excluded.
 * When false, the home country is included in tracking.
 */
export function calculateAllTaxStatuses(
  trips: Trip[],
  citizenshipCode: string,
  hasFixedResidence: boolean,
): TaxStatus[] {
  const visitedCodes = [...new Set(trips.map((t) => t.country_code))];
  const applicableRules = getApplicableTaxRules(citizenshipCode, visitedCodes, hasFixedResidence);

  const statuses: TaxStatus[] = applicableRules.map(({ countryCode, rule }) => {
    const daysPresent = countDaysInRollingWindow(trips, [countryCode], rule.windowDays);
    const daysRemaining = Math.max(0, rule.thresholdDays - daysPresent);
    const percentUsed = rule.thresholdDays > 0 ? (daysPresent / rule.thresholdDays) * 100 : 0;

    return {
      country: getCountryName(trips, countryCode),
      countryCode,
      flag: countryCodeToFlag(countryCode),
      ruleLabel: rule.label,
      thresholdDays: rule.thresholdDays,
      daysPresent,
      daysRemaining,
      percentUsed,
      status: getStatusFromPercent(percentUsed),
    };
  });

  // Sort by urgency: resident → warning → caution → safe, then by percent desc
  const statusOrder = { resident: 0, warning: 1, caution: 2, safe: 3 };
  statuses.sort((a, b) => {
    const orderDiff = statusOrder[a.status] - statusOrder[b.status];
    if (orderDiff !== 0) return orderDiff;
    return b.percentUsed - a.percentUsed;
  });

  return statuses;
}
