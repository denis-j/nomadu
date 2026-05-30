import { Trip } from '../lib/database';

// Schengen Area member states (27 countries including Croatia)
export const SCHENGEN_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE',
  'GR', 'HU', 'IS', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'NO',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH', 'LI',
] as const;

// EU/EEA/CH citizens who have freedom of movement in Schengen
export const EU_EEA_CH_CITIZENS = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // EEA
  'IS', 'LI', 'NO',
  // Switzerland
  'CH',
] as const;

export type RuleType = 'visa_free' | 'rolling_window' | 'freedom_of_movement';

export interface VisaRule {
  allowedDays: number;
  windowDays: number;
  ruleType: RuleType;
  label: string;
}

// Schengen rolling window rule (used for non-EU citizens)
const SCHENGEN_RULE: VisaRule = {
  allowedDays: 90,
  windowDays: 180,
  ruleType: 'rolling_window',
  label: '90/180 rolling window',
};

// Default visa rules by destination country code
export const DEFAULT_VISA_RULES: Record<string, VisaRule> = {
  // Thailand — 60 days visa-free
  TH: { allowedDays: 60, windowDays: 0, ruleType: 'visa_free', label: '60 days visa-free' },
  // Japan — 90 days visa-free
  JP: { allowedDays: 90, windowDays: 0, ruleType: 'visa_free', label: '90 days visa-free' },
  // United States — 90 days ESTA
  US: { allowedDays: 90, windowDays: 0, ruleType: 'visa_free', label: '90 days (ESTA)' },
  // United Kingdom — 180 days per visit
  GB: { allowedDays: 180, windowDays: 365, ruleType: 'rolling_window', label: '180 days per year' },
  // Australia — 90 days ETA
  AU: { allowedDays: 90, windowDays: 0, ruleType: 'visa_free', label: '90 days (ETA)' },
  // Indonesia — 30 days visa-free
  ID: { allowedDays: 30, windowDays: 0, ruleType: 'visa_free', label: '30 days visa-free' },
  // Mexico — 180 days visa-free
  MX: { allowedDays: 180, windowDays: 0, ruleType: 'visa_free', label: '180 days visa-free' },
  // South Korea — 90 days visa-free
  KR: { allowedDays: 90, windowDays: 0, ruleType: 'visa_free', label: '90 days visa-free' },
  // Colombia — 90/180 rolling window
  CO: { allowedDays: 90, windowDays: 180, ruleType: 'rolling_window', label: '90/180 rolling window' },
  // Georgia — 365 days visa-free
  GE: { allowedDays: 365, windowDays: 0, ruleType: 'visa_free', label: '365 days visa-free' },
  // Turkey — 90/180 rolling window
  TR: { allowedDays: 90, windowDays: 180, ruleType: 'rolling_window', label: '90/180 rolling window' },
  // Montenegro — 90 days visa-free
  ME: { allowedDays: 90, windowDays: 0, ruleType: 'visa_free', label: '90 days visa-free' },
  // Serbia — 90 days visa-free
  RS: { allowedDays: 90, windowDays: 0, ruleType: 'visa_free', label: '90 days visa-free' },
  // Albania — 90 days visa-free
  AL: { allowedDays: 90, windowDays: 0, ruleType: 'visa_free', label: '90 days visa-free' },
  // Brazil — 90 days visa-free
  BR: { allowedDays: 90, windowDays: 0, ruleType: 'visa_free', label: '90 days visa-free' },
};

export interface ApplicableRule {
  destinationCode: string;
  destinationLabel: string;
  rule: VisaRule;
  countryCodes: string[]; // codes that count toward this rule (e.g. all Schengen codes)
}

/**
 * Returns only the visa rules relevant to a given citizen visiting specific countries.
 * Skips home country and Schengen for EU/EEA/CH citizens.
 */
export function getApplicableRules(
  citizenshipCode: string,
  visitedCountryCodes: string[],
): ApplicableRule[] {
  const isEuCitizen = (EU_EEA_CH_CITIZENS as readonly string[]).includes(citizenshipCode);
  const visited = new Set(visitedCountryCodes);
  const rules: ApplicableRule[] = [];

  // Check Schengen rule for non-EU citizens
  if (!isEuCitizen) {
    const visitedSchengen = (SCHENGEN_COUNTRIES as readonly string[]).filter(
      (c) => visited.has(c) && c !== citizenshipCode,
    );
    if (visitedSchengen.length > 0) {
      rules.push({
        destinationCode: 'SCHENGEN',
        destinationLabel: 'Schengen Area',
        rule: SCHENGEN_RULE,
        countryCodes: [...SCHENGEN_COUNTRIES],
      });
    }
  }

  // Check individual country rules
  for (const code of visited) {
    // Skip home country
    if (code === citizenshipCode) continue;

    // Skip Schengen countries for non-EU citizens (already handled above)
    if (!isEuCitizen && (SCHENGEN_COUNTRIES as readonly string[]).includes(code)) continue;

    // Skip Schengen countries for EU citizens (freedom of movement)
    if (isEuCitizen && (SCHENGEN_COUNTRIES as readonly string[]).includes(code)) continue;

    const rule = DEFAULT_VISA_RULES[code];
    if (rule) {
      rules.push({
        destinationCode: code,
        destinationLabel: code,
        rule,
        countryCodes: [code],
      });
    }
  }

  return rules;
}
