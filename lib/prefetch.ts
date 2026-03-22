import { getAllTrips, getAllJourneys, getAllTripsRaw, getStats, Trip, Stats, Journey } from './database';
import { getCitizenship, getHasFixedResidence } from './onboarding';
import { calculateAllVisaStatuses, VisaStatus } from './visaCalculations';
import { calculateAllTaxStatuses, TaxStatus } from './taxCalculations';

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
  try {
    const citizenship = await getCitizenship(uid);
    if (!citizenship) return;
    citizenshipCache = { country: citizenship.country, countryCode: citizenship.countryCode };

    const [trips, hasFixedResidence] = await Promise.all([
      getAllTripsRaw(),
      getHasFixedResidence(uid),
    ]);

    visaStatusesCache = calculateAllVisaStatuses(trips, citizenship.countryCode);
    taxStatusesCache = calculateAllTaxStatuses(trips, citizenship.countryCode, hasFixedResidence ?? true);
  } catch (err) {
    console.error('User data prefetch failed:', err);
  }
}
