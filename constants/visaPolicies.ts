/**
 * Visa policy seed data.
 *
 * Each destination declares a `default` rule plus optional `overrides` for
 * specific citizenships or citizenship groups. Lookup logic lives in
 * `./visaRules.ts`.
 *
 * Last verified: 2026-06-01.
 *
 * Sources are linked per-rule (`source` field). When in doubt, Wikipedia's
 * "Visa policy of <country>" article is treated as the canonical reference.
 * Rules CHANGE — this dataset is a best-effort snapshot, not legal advice.
 * The disclaimer on the visa screen makes that clear to users.
 */

import type { DestinationPolicy, VisaRule } from './visaRules';

// ─── Country groups ────────────────────────────────────────────────────────

/** Schengen Area member states (29 — incl. Croatia, Bulgaria, Romania). */
export const SCHENGEN_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE',
  'GR', 'HU', 'IS', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL',
  'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH',
] as const;

/** EU + EEA + Switzerland citizens — freedom of movement inside Schengen. */
export const EU_EEA_CH_CITIZENS = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO', 'CH',
] as const;

/**
 * Countries eligible for the US Visa Waiver Program (90 days ESTA).
 * Source: https://travel.state.gov/content/travel/en/us-visas/tourism-visit/visa-waiver-program.html
 */
export const US_VWP_CITIZENS = [
  // EU + EEA + Switzerland (all covered except CY, RO, BG)
  'AT', 'BE', 'HR', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL',
  'NO', 'PL', 'PT', 'SK', 'SI', 'ES', 'SE', 'CH',
  // Plus
  'AD', 'AU', 'BN', 'CL', 'IL', 'JP', 'KR', 'MC', 'NZ', 'QA',
  'SM', 'SG', 'TW', 'GB',
] as const;

/** Common "western" passports with broad visa-free access. Useful as a
 *  shorthand for overrides covering Canada, UK, AU, NZ, JP, KR, IL etc. */
const WESTERN_CITIZENS = [
  ...EU_EEA_CH_CITIZENS,
  'GB', 'US', 'CA', 'AU', 'NZ', 'JP', 'KR', 'IL', 'SG',
] as const;

// ─── Reusable rule templates ───────────────────────────────────────────────

const ninetyDaysVisaFree = (label: string, source?: string): VisaRule => ({
  allowedDays: 90, windowDays: 0, ruleType: 'visa_free', label, source,
});

const visaRequired = (source?: string): VisaRule => ({
  allowedDays: 0, windowDays: 0, ruleType: 'visa_required',
  label: 'Visa required', source,
});

// ─── Destination policies ──────────────────────────────────────────────────

/**
 * Schengen as a single aggregated rule — the 90/180 limit applies across the
 * whole area, not per country. EU/EEA/CH citizens have freedom of movement.
 */
export const SCHENGEN_AREA_POLICY: DestinationPolicy = {
  default: {
    allowedDays: 90, windowDays: 180, ruleType: 'rolling_window',
    label: '90/180 rolling window',
    source: 'https://en.wikipedia.org/wiki/Visa_policy_of_the_Schengen_Area',
  },
  overrides: [
    { citizens: EU_EEA_CH_CITIZENS, rule: null }, // freedom of movement
  ],
};

export const DESTINATION_POLICIES: Record<string, DestinationPolicy> = {
  // ─── Americas ─────────────────────────────────────────────────────────────
  US: {
    default: visaRequired('https://en.wikipedia.org/wiki/Visa_policy_of_the_United_States'),
    overrides: [
      { citizens: US_VWP_CITIZENS, rule: {
        allowedDays: 90, windowDays: 0, ruleType: 'visa_free',
        label: '90 days (ESTA)',
        source: 'https://en.wikipedia.org/wiki/Visa_Waiver_Program',
      }},
    ],
  },
  CA: {
    default: {
      allowedDays: 180, windowDays: 365, ruleType: 'rolling_window',
      label: '180 days per year (eTA)',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Canada',
    },
  },
  MX: {
    default: {
      allowedDays: 180, windowDays: 0, ruleType: 'visa_free',
      label: '180 days visa-free',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Mexico',
    },
  },
  BR: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_Brazil'),
  },
  AR: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_Argentina'),
  },
  CL: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_Chile'),
  },
  UY: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_Uruguay'),
  },
  PE: {
    default: {
      allowedDays: 183, windowDays: 365, ruleType: 'rolling_window',
      label: '183 days per year',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Peru',
    },
  },
  EC: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_Ecuador'),
  },
  CO: {
    default: {
      allowedDays: 90, windowDays: 180, ruleType: 'rolling_window',
      label: '90/180 rolling window',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Colombia',
    },
  },
  CR: {
    default: {
      allowedDays: 180, windowDays: 0, ruleType: 'visa_free',
      label: '180 days visa-free',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Costa_Rica',
    },
  },
  PA: {
    default: {
      allowedDays: 180, windowDays: 0, ruleType: 'visa_free',
      label: '180 days visa-free',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Panama',
    },
  },
  DO: {
    default: {
      allowedDays: 30, windowDays: 0, ruleType: 'visa_free',
      label: '30 days (tourist card)',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_the_Dominican_Republic',
    },
  },

  // ─── Europe (non-Schengen) ───────────────────────────────────────────────
  GB: {
    default: {
      allowedDays: 180, windowDays: 365, ruleType: 'rolling_window',
      label: '180 days per visit',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_the_United_Kingdom',
    },
  },
  IE: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_Ireland'),
    overrides: [
      { citizens: EU_EEA_CH_CITIZENS, rule: null }, // Common Travel Area + EU
      { citizens: ['GB'], rule: null }, // CTA
    ],
  },
  AL: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_Albania'),
  },
  RS: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_Serbia'),
  },
  ME: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_Montenegro'),
  },
  BA: {
    default: {
      allowedDays: 90, windowDays: 180, ruleType: 'rolling_window',
      label: '90/180 rolling window',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Bosnia_and_Herzegovina',
    },
  },
  MK: {
    default: {
      allowedDays: 90, windowDays: 180, ruleType: 'rolling_window',
      label: '90/180 rolling window',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_North_Macedonia',
    },
  },
  XK: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_Kosovo'),
  },
  TR: {
    default: {
      allowedDays: 90, windowDays: 180, ruleType: 'rolling_window',
      label: '90/180 rolling window',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Turkey',
    },
  },
  GE: {
    default: {
      allowedDays: 365, windowDays: 0, ruleType: 'visa_free',
      label: '365 days visa-free',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Georgia',
    },
  },
  AM: {
    default: {
      allowedDays: 180, windowDays: 365, ruleType: 'rolling_window',
      label: '180 days per year',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Armenia',
    },
  },
  UA: {
    default: {
      allowedDays: 90, windowDays: 180, ruleType: 'rolling_window',
      label: '90/180 rolling window',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Ukraine',
    },
  },
  MD: {
    default: {
      allowedDays: 90, windowDays: 180, ruleType: 'rolling_window',
      label: '90/180 rolling window',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Moldova',
    },
  },

  // ─── Asia ─────────────────────────────────────────────────────────────────
  TH: {
    default: {
      allowedDays: 60, windowDays: 0, ruleType: 'visa_free',
      label: '60 days visa-free',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Thailand',
    },
  },
  JP: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_Japan'),
  },
  KR: {
    default: {
      allowedDays: 90, windowDays: 0, ruleType: 'visa_free',
      label: '90 days (K-ETA)',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_South_Korea',
    },
  },
  ID: {
    default: {
      allowedDays: 30, windowDays: 0, ruleType: 'visa_on_arrival',
      label: '30 days visa-on-arrival',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Indonesia',
    },
  },
  MY: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_Malaysia'),
  },
  SG: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_Singapore'),
  },
  PH: {
    default: {
      allowedDays: 30, windowDays: 0, ruleType: 'visa_free',
      label: '30 days visa-free',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_the_Philippines',
    },
  },
  VN: {
    default: {
      allowedDays: 45, windowDays: 0, ruleType: 'visa_free',
      label: '45 days visa-free',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Vietnam',
    },
  },
  TW: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_Taiwan'),
  },
  IN: {
    default: visaRequired('https://en.wikipedia.org/wiki/Visa_policy_of_India'),
  },

  // ─── Oceania ─────────────────────────────────────────────────────────────
  AU: {
    default: {
      allowedDays: 90, windowDays: 0, ruleType: 'visa_free',
      label: '90 days (ETA)',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Australia',
    },
  },
  NZ: {
    default: {
      allowedDays: 90, windowDays: 0, ruleType: 'visa_free',
      label: '90 days (NZeTA)',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_New_Zealand',
    },
  },

  // ─── Middle East ─────────────────────────────────────────────────────────
  AE: {
    default: {
      allowedDays: 90, windowDays: 180, ruleType: 'rolling_window',
      label: '90/180 rolling window',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_the_United_Arab_Emirates',
    },
  },
  IL: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_Israel'),
  },
  JO: {
    default: {
      allowedDays: 30, windowDays: 0, ruleType: 'visa_on_arrival',
      label: '30 days visa-on-arrival',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Jordan',
    },
  },

  // ─── Africa ──────────────────────────────────────────────────────────────
  MA: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_Morocco'),
  },
  EG: {
    default: {
      allowedDays: 30, windowDays: 0, ruleType: 'visa_on_arrival',
      label: '30 days visa-on-arrival',
      source: 'https://en.wikipedia.org/wiki/Visa_policy_of_Egypt',
    },
  },
  ZA: {
    default: ninetyDaysVisaFree('90 days visa-free',
      'https://en.wikipedia.org/wiki/Visa_policy_of_South_Africa'),
    overrides: [
      { citizens: WESTERN_CITIZENS, rule: ninetyDaysVisaFree('90 days visa-free') },
    ],
  },
};
