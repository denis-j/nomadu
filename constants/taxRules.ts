export interface TaxRule {
  thresholdDays: number;
  windowDays: number;
  label: string;
}

const DEFAULT_TAX_RULE: TaxRule = {
  thresholdDays: 183,
  windowDays: 365,
  label: '183 days in 365-day window',
};

/**
 * Returns a TaxRule for visited countries.
 * When hasFixedResidence is true, the home country is excluded (user is already tax resident there).
 * When hasFixedResidence is false, the home country is included — spending 183+ days could trigger residency.
 */
export function getApplicableTaxRules(
  citizenshipCode: string,
  visitedCountryCodes: string[],
  hasFixedResidence: boolean,
): { countryCode: string; rule: TaxRule }[] {
  return visitedCountryCodes
    .filter((code) => hasFixedResidence ? code !== citizenshipCode : true)
    .map((code) => ({ countryCode: code, rule: DEFAULT_TAX_RULE }));
}
