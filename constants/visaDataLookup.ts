/**
 * Bulk-imported visa matrix lookup.
 *
 * Translates raw cells from `passport-index-dataset` (constants/visa-data.json)
 * into our internal `VisaRule` shape. Used as the FALLBACK when a destination
 * doesn't have a hand-curated entry in `constants/visaPolicies.ts` — manual
 * policies always win because they encode special arrangements (US VWP, the
 * IE Common Travel Area, Schengen aggregation) that the matrix can't express.
 *
 * Dataset cell taxonomy (from the source CSV):
 *   number              → visa-free for N days (e.g. 90, 180, 360)
 *   "visa free"         → visa-free, no specific limit given
 *   "visa on arrival"   → visa issued at the border
 *   "e-visa"            → electronic visa required IN ADVANCE
 *   "eta"               → electronic travel authorization (lightweight pre-clearance)
 *   "visa required"     → traditional visa required
 *   "covid ban"         → entry banned
 *   "no admission"      → entry banned
 *   "trump ban"         → entry banned (historical, kept for compatibility)
 *   -1                  → same country
 */

import type { VisaRule } from './visaRules';
import data from './visa-data.json';

interface VisaDataPayload {
  _meta: {
    source: string;
    license: string;
    licenseCopyright: string;
    refreshedAt: string;
    passports: number;
    destinations: number;
  };
  matrix: Record<string, Record<string, number | string>>;
}

const VISA_DATA = data as VisaDataPayload;

/** Date the bundled matrix was last refreshed from the upstream dataset. */
export const VISA_DATA_REFRESHED_AT = VISA_DATA._meta.refreshedAt;

/** Source URL — surfaced to users as the "official source" link fallback. */
export const VISA_DATA_SOURCE = VISA_DATA._meta.source;

/**
 * Default day allowances for cell types where the dataset doesn't carry a
 * number. These are conservative typical values; users with specific visas
 * that grant more should add a user_visa override.
 */
const DEFAULT_DAYS = {
  visa_free: 90,
  visa_on_arrival: 30,
  eta: 90,
} as const;

/**
 * Look up the citizenship × destination cell and build a VisaRule from it.
 * Returns null when:
 *   - the dataset doesn't know this pair (rare — only edge codes)
 *   - the destination IS the user's home country (cell value -1)
 */
export function lookupFromDataset(
  citizenshipCode: string,
  destinationCode: string,
): VisaRule | null {
  const row = VISA_DATA.matrix[citizenshipCode];
  if (!row) return null;
  const cell = row[destinationCode];
  if (cell === undefined) return null;
  if (cell === -1) return null;

  if (typeof cell === 'number') {
    return {
      allowedDays: cell,
      windowDays: 0,
      ruleType: 'visa_free',
      label: `${cell} days visa-free`,
      source: VISA_DATA_SOURCE,
      lastVerified: VISA_DATA_REFRESHED_AT,
    };
  }

  const normalised = cell.toLowerCase().trim();
  switch (normalised) {
    case 'visa free':
      return {
        allowedDays: DEFAULT_DAYS.visa_free,
        windowDays: 0,
        ruleType: 'visa_free',
        label: 'Visa-free',
        source: VISA_DATA_SOURCE,
        lastVerified: VISA_DATA_REFRESHED_AT,
      };
    case 'visa on arrival':
      return {
        allowedDays: DEFAULT_DAYS.visa_on_arrival,
        windowDays: 0,
        ruleType: 'visa_on_arrival',
        label: 'Visa on arrival',
        source: VISA_DATA_SOURCE,
        lastVerified: VISA_DATA_REFRESHED_AT,
      };
    case 'eta':
      return {
        allowedDays: DEFAULT_DAYS.eta,
        windowDays: 0,
        ruleType: 'visa_free',
        label: 'ETA required',
        source: VISA_DATA_SOURCE,
        lastVerified: VISA_DATA_REFRESHED_AT,
      };
    case 'e-visa':
    case 'visa required':
    case 'no admission':
    case 'covid ban':
    case 'trump ban':
    default:
      return {
        allowedDays: 0,
        windowDays: 0,
        ruleType: 'visa_required',
        label: normalised === 'e-visa' ? 'e-Visa required' : 'Visa required',
        source: VISA_DATA_SOURCE,
        lastVerified: VISA_DATA_REFRESHED_AT,
      };
  }
}
