/**
 * Visa rule engine — citizenship-aware lookup.
 *
 * The policy data lives in `./visaPolicies.ts`. This file defines the schema
 * and the resolver: given a citizenship code and the destinations a user has
 * visited, return the list of rules that apply to them.
 *
 * Rule resolution per destination:
 *   1. If any `overrides` entry's `citizens` list contains the user's
 *      citizenship code, that rule wins.
 *   2. Otherwise fall back to `default`.
 *   3. If the resolved rule is `null`, no tracking is needed (freedom of
 *      movement, no visa required, etc.) — destination is skipped.
 *
 * Schengen is special: it's treated as a single aggregated destination
 * ("SCHENGEN") so that day-counting works across all member states at once,
 * which matches how the 90/180 rule actually applies.
 */

import {
  SCHENGEN_COUNTRIES,
  EU_EEA_CH_CITIZENS,
  SCHENGEN_AREA_POLICY,
  DESTINATION_POLICIES,
} from './visaPolicies';
import { lookupFromDataset, VISA_DATA_REFRESHED_AT } from './visaDataLookup';

export { SCHENGEN_COUNTRIES, EU_EEA_CH_CITIZENS };

export type RuleType =
  | 'visa_free'         // X days per stay, resets on exit
  | 'rolling_window'    // X days per Y-day window
  | 'visa_on_arrival'   // visa issued at border, but trackable like visa_free
  | 'visa_required';    // no automatic tracking — user must add their own visa

export interface VisaRule {
  allowedDays: number;
  /** Window in days for rolling rules. 0 = per-stay rule (resets on exit). */
  windowDays: number;
  ruleType: RuleType;
  /** Short label rendered in the UI. */
  label: string;
  /** URL to authoritative source (e.g. Wikipedia, embassy) for verification. */
  source?: string;
  /** YYYY-MM-DD — when this rule was last cross-checked against its source. */
  lastVerified?: string;
}

export interface DestinationPolicy {
  /** Rule that applies when no override matches the user's citizenship. */
  default: VisaRule | null;
  /**
   * Citizenship-specific overrides. Checked in order; first match wins.
   * `citizens` is an array of ISO2 codes (or a citizenship-group constant).
   * A `null` rule means "no tracking" (e.g. freedom of movement).
   */
  overrides?: Array<{
    citizens: readonly string[];
    rule: VisaRule | null;
  }>;
}

export interface ApplicableRule {
  destinationCode: string;
  destinationLabel: string;
  rule: VisaRule;
  /** Country codes that count toward this rule's day total. */
  countryCodes: string[];
}

/**
 * Date the seed dataset was last cross-checked. Per-rule `lastVerified` wins
 * when present, but most policies share the same audit timestamp so a single
 * fallback keeps the policy file readable.
 */
export const VISA_DATA_LAST_VERIFIED = VISA_DATA_REFRESHED_AT;

/**
 * Returns the `default` rule for a destination (citizenship-agnostic) — used
 * by the plans screen to project planned-leg days against the most common
 * visa allowance for that country. For citizenship-aware behaviour, use
 * `getApplicableRules` instead.
 */
export function getDefaultRuleForCountry(countryCode: string): VisaRule | null {
  return DESTINATION_POLICIES[countryCode]?.default ?? null;
}

/**
 * Resolve which rule applies to a given citizen for a destination policy.
 * Returns null when no rule applies (freedom of movement, home country, etc.).
 */
export function resolvePolicy(
  citizenshipCode: string,
  policy: DestinationPolicy,
): VisaRule | null {
  const raw = (() => {
    if (policy.overrides) {
      for (const override of policy.overrides) {
        if (override.citizens.includes(citizenshipCode)) {
          return override.rule;
        }
      }
    }
    return policy.default;
  })();
  if (!raw) return null;
  // Fill in the dataset-wide audit timestamp so the UI always has something
  // to surface, without forcing every policy entry to repeat the same date.
  return raw.lastVerified ? raw : { ...raw, lastVerified: VISA_DATA_LAST_VERIFIED };
}

/**
 * Given a citizenship and the set of countries the user has visited,
 * return the list of visa rules that should be tracked for them.
 * Skips home country and destinations with no applicable rule.
 */
export function getApplicableRules(
  citizenshipCode: string,
  visitedCountryCodes: string[],
): ApplicableRule[] {
  const visited = new Set(visitedCountryCodes);
  const rules: ApplicableRule[] = [];

  // 1. Schengen Area — handled as one aggregated rule so days roll across
  //    all member states together. Skip if the user is an EU/EEA/CH citizen
  //    and the override resolves to null (freedom of movement).
  const visitedSchengen = SCHENGEN_COUNTRIES.filter(
    (c) => visited.has(c) && c !== citizenshipCode,
  );
  if (visitedSchengen.length > 0) {
    const schengenRule = resolvePolicy(citizenshipCode, SCHENGEN_AREA_POLICY);
    if (schengenRule) {
      rules.push({
        destinationCode: 'SCHENGEN',
        destinationLabel: 'Schengen Area',
        rule: schengenRule,
        countryCodes: [...SCHENGEN_COUNTRIES],
      });
    }
  }

  // 2. Per-destination rules for every non-Schengen country the user visited.
  //    Lookup priority:
  //      a) hand-curated DESTINATION_POLICIES entry (US VWP, IE CTA, etc.)
  //      b) bulk dataset lookup (passport-index, ~200×200 matrix fallback)
  for (const code of visited) {
    if (code === citizenshipCode) continue;
    if ((SCHENGEN_COUNTRIES as readonly string[]).includes(code)) continue;

    const policy = DESTINATION_POLICIES[code];
    const rule = policy
      ? resolvePolicy(citizenshipCode, policy)
      : lookupFromDataset(citizenshipCode, code);
    if (!rule) continue;

    rules.push({
      destinationCode: code,
      destinationLabel: code,
      rule,
      countryCodes: [code],
    });
  }

  return rules;
}
