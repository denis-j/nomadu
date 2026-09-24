import { getAllTrips, getAllJourneys, getAllTripsRaw, getStats, Trip, Stats, Journey } from './database';
import { getCitizenship, getHasFixedResidence } from './onboarding';
import { calculateAllVisaStatuses, VisaStatus } from './visaCalculations';
import { calculateAllTaxStatuses, TaxStatus } from './taxCalculations';
import { avatarSvg, avatarUri } from './avatars';
import { avatarSeed } from './avatarSeed';
import { getProfile, prefetchSuggestedFaces } from './profile';

let tripsCache: Trip[] | null = null;
let statsCache: Stats | null = null;
let journeysCache: Journey[] | null = null;
let visaStatusesCache: VisaStatus[] | null = null;
let taxStatusesCache: TaxStatus[] | null = null;
let citizenshipCache: { country: string; countryCode: string } | null = null;

export function getTripsCache(): Trip[] | null { return tripsCache; }
export function getStatsCache(): Stats | null { return statsCache; }
export function getJourneysCache(): Journey[] | null { return journeysCache; }
export function getVisaStatusesCache(): VisaStatus[] | null { return visaStatusesCache; }
export function getTaxStatusesCache(): TaxStatus[] | null { return taxStatusesCache; }
export function getCitizenshipCache(): { country: string; countryCode: string } | null { return citizenshipCache; }

/** Forget everything read so far, for when the data it came from is gone. */
export function resetPrefetchCaches(): void {
  tripsCache = null;
  statsCache = null;
  journeysCache = null;
  visaStatusesCache = null;
  taxStatusesCache = null;
  citizenshipCache = null;
}

export async function prefetchAll(): Promise<void> {
  try {
    [tripsCache, statsCache, journeysCache] = await Promise.all([
      getAllTrips(),
      getStats(),
      getAllJourneys(),
    ]);
  } catch (err) {
    console.error('Prefetch failed:', err);
  }
}

export async function prefetchUserData(uid: string): Promise<void> {
  // The chosen face, so the avatar rows have it in their first frame.
  const profile = await getProfile(uid).catch(() => null);
  // Faces for Settings and the profile editor, in the background.
  const face = profile?.avatar ?? avatarSeed(uid);
  avatarUri(face);
  avatarSvg(face);
  prefetchSuggestedFaces().catch(() => {});
  try {
    const citizenship = await getCitizenship(uid);
    if (!citizenship) return;
    citizenshipCache = { country: citizenship.country, countryCode: citizenship.countryCode };
    // prefetchAll ran before the citizenship was known, so its stats counted
    // days at home as away. Redone here, before the screens show them.
    statsCache = await getStats(null, citizenship.countryCode);

    const { getAllUserVisas } = await import('./userVisas');
    const [trips, hasFixedResidence, userVisas] = await Promise.all([
      getAllTripsRaw(),
      getHasFixedResidence(uid),
      getAllUserVisas(),
    ]);

    visaStatusesCache = calculateAllVisaStatuses(trips, citizenship.countryCode, userVisas);
    taxStatusesCache = calculateAllTaxStatuses(trips, citizenship.countryCode, hasFixedResidence ?? true);
  } catch (err) {
    console.error('User data prefetch failed:', err);
  }
}
