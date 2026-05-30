export interface TaxRule {
  thresholdDays: number;
  /** Label shown in the UI; the `{year}` placeholder is replaced at render time. */
  label: string;
}

const DEFAULT_TAX_RULE: TaxRule = {
  thresholdDays: 183,
  label: '183 days in {year}',
};

/**
 * Returns a TaxRule for each visited country.
 * When hasFixedResidence is true, the home country is excluded (user is already
 * tax resident there). When false, the home country is included — spending
 * 183+ days could trigger residency.
 */
export function getApplicableTaxRules(
  citizenshipCode: string,
  visitedCountryCodes: string[],
  hasFixedResidence: boolean,
): { countryCode: string; rule: TaxRule }[] {
  return visitedCountryCodes
    .filter((code) => (hasFixedResidence ? code !== citizenshipCode : true))
    .map((code) => ({ countryCode: code, rule: DEFAULT_TAX_RULE }));
}
