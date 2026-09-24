/**
 * Over which stretch of time a country counts the days.
 *
 * - `year`: a tax year starting on the given month and day. January 1 is
 *   the calendar year, which is how most countries count; the UK starts on
 *   6 April, Australia on 1 July.
 * - `rolling`: any run of `days` days, wherever it falls (New Zealand: 183
 *   days in any 12-month period).
 */
export type TaxPeriod =
  | { kind: 'year'; startMonth: number; startDay: number }
  | { kind: 'rolling'; days: number };

export interface TaxRule {
  thresholdDays: number;
  period: TaxPeriod;
}

const CALENDAR_YEAR: TaxPeriod = { kind: 'year', startMonth: 1, startDay: 1 };

const DEFAULT_TAX_RULE: TaxRule = { thresholdDays: 183, period: CALENDAR_YEAR };

/**
 * Countries whose 183-day test does not run over the calendar year. Only the
 * day-count test is modelled: the UK's statutory residence test, for one,
 * can make someone resident with far fewer days through ties or a home
 * there, which the app cannot know. 183 days is the point from which the
 * test alone decides.
 */
const TAX_RULES: Record<string, TaxRule> = {
  // UK tax year: 6 April to 5 April. 183 days in it is the automatic UK test.
  GB: { thresholdDays: 183, period: { kind: 'year', startMonth: 4, startDay: 6 } },
  // Australian income year: 1 July to 30 June.
  AU: { thresholdDays: 183, period: { kind: 'year', startMonth: 7, startDay: 1 } },
  // New Zealand: more than 183 days in any 12-month period.
  NZ: { thresholdDays: 183, period: { kind: 'rolling', days: 365 } },
};

export function getTaxRule(countryCode: string): TaxRule {
  return TAX_RULES[countryCode.toUpperCase()] ?? DEFAULT_TAX_RULE;
}

/**
 * Returns a TaxRule for each visited country.
 * When hasFixedResidence is true, the home country is excluded (user is already
 * tax resident there). When false, the home country is included, spending
 * 183+ days could trigger residency.
 */
export function getApplicableTaxRules(
  citizenshipCode: string,
  visitedCountryCodes: string[],
  hasFixedResidence: boolean,
): { countryCode: string; rule: TaxRule }[] {
  return visitedCountryCodes
    .filter((code) => (hasFixedResidence ? code !== citizenshipCode : true))
    .map((code) => ({ countryCode: code, rule: getTaxRule(code) }));
}
