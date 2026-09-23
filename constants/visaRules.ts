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
import { datasetStatedDays, lookupFromDataset, VISA_DATA_REFRESHED_AT } from './visaDataLookup';

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

/** Differences up to this many days between the two sources are rounding. */
const ROUNDING_TOLERANCE_DAYS = 7;

function withVerified(rule: VisaRule | null): VisaRule | null {
  if (!rule) return null;
  // Fill in the dataset-wide audit timestamp so the UI always has something
  // to surface, without forcing every policy entry to repeat the same date.
  return rule.lastVerified ? rule : { ...rule, lastVerified: VISA_DATA_LAST_VERIFIED };
}

/**
 * Resolve which rule applies to a given citizen for a destination policy.
 * Returns null when no rule applies (freedom of movement, home country, etc.).
 *
 * `datasetCode` is the country whose dataset cell stands for this
 * destination: the destination itself, or a visited member state for the
 * Schengen aggregate.
 *
 * The curated `default` was written with the passports that travel there
 * visa-free in mind, and used to apply to every passport: India to France
 * came out as 90/180 visa-free, Nigeria to the UK as 180 days. So:
 *
 *   1. An override naming this citizenship wins outright (ESTA, freedom of
 *      movement, the Common Travel Area).
 *   2. Otherwise the dataset decides whether this passport needs a visa
 *      before travelling. If it does, that is the answer.
 *   3. If both agree that entry needs no visa in advance, the curated rule
 *      describes the allowance, since it knows rolling windows the dataset
 *      cannot express. A per-stay rule that grants more days than the
 *      dataset states for this passport gives way to the dataset's number.
 *   4. If the curated default says "visa required" but the dataset lists
 *      this passport as visa-free, the dataset is the more specific source.
 */
export function resolvePolicy(
  citizenshipCode: string,
  policy: DestinationPolicy,
  datasetCode?: string,
): VisaRule | null {
  const override = policy.overrides?.find((o) => o.citizens.includes(citizenshipCode));
  if (override) return withVerified(override.rule);

  const curated = policy.default;
  if (!curated || !datasetCode) return withVerified(curated);

  const dataset = lookupFromDataset(citizenshipCode, datasetCode);
  // The dataset does not know this pair: the curated default is all there is.
  if (!dataset) return withVerified(curated);
  if (dataset.ruleType === 'visa_required') return dataset;
  if (curated.ruleType === 'visa_required') return dataset;

  // The dataset writes a year as 360: a gap that small is rounding, not a
  // shorter allowance for this passport.
  const statedDays = datasetStatedDays(citizenshipCode, datasetCode);
  if (
    curated.windowDays === 0 &&
    statedDays !== null &&
    statedDays < curated.allowedDays - ROUNDING_TOLERANCE_DAYS
  ) {
    return dataset;
  }
  return withVerified(curated);
}

/**
 * The rule that applies to one citizen in one destination, whether or not they
 * have ever been there.
 *
 * Same resolution order as `getApplicableRules` (Schengen aggregate, then the
 * hand-curated policy, then the bulk dataset), so a planned first trip is
 * projected against the same allowance the Visa tab shows once the trip is
 * real. The citizenship-agnostic variant this replaced answered a different
 * question: it returned the US "visa required" default even for a German
 * passport that gets 90 days on ESTA.
 */
export function getRuleForCitizen(
  citizenshipCode: string,
  destinationCode: string,
): VisaRule | null {
  if (!destinationCode || destinationCode === citizenshipCode) return null;

  if ((SCHENGEN_COUNTRIES as readonly string[]).includes(destinationCode)) {
    return resolvePolicy(citizenshipCode, SCHENGEN_AREA_POLICY, destinationCode);
  }

  const policy = DESTINATION_POLICIES[destinationCode];
  return policy
    ? resolvePolicy(citizenshipCode, policy, destinationCode)
    : lookupFromDataset(citizenshipCode, destinationCode);
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
    // Schengen visa policy is common to all member states, so any visited
    // one stands for the area in the dataset.
    const schengenRule = resolvePolicy(citizenshipCode, SCHENGEN_AREA_POLICY, visitedSchengen[0]);
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
      ? resolvePolicy(citizenshipCode, policy, code)
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
