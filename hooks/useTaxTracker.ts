import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from './useAuth';
import { getCitizenship, getHasFixedResidence } from '../lib/onboarding';
import { getAllTripsRaw } from '../lib/database';
import { calculateAllTaxStatuses, TaxStatus } from '../lib/taxCalculations';
import { getTaxStatusesCache } from '../lib/prefetch';
import { availableYearsFromTrips } from '../lib/yearFilter';

/**
 * @param year Calendar year to compute against. Defaults to the current year.
 */
export function useTaxTracker(year: number = new Date().getFullYear()) {
  const { user } = useAuth();
  // Cache is only meaningful for the current year (that's what prefetch fills).
  const cached = year === new Date().getFullYear() ? getTaxStatusesCache() : null;
  const [taxStatuses, setTaxStatuses] = useState<TaxStatus[]>(cached ?? []);
  const [availableYears, setAvailableYears] = useState<number[]>([new Date().getFullYear()]);
  const [ready, setReady] = useState(cached !== null);
  const [citizenshipCode, setCitizenshipCode] = useState<string | null>(null);
  const [citizenshipCountry, setCitizenshipCountry] = useState<string | null>(null);
  const initialised = useRef(cached !== null);

  const refresh = useCallback(async () => {
    if (!user) {
      if (!initialised.current) { initialised.current = true; setReady(true); }
      return;
    }

    try {
      const citizenship = await getCitizenship(user.uid);
      if (!citizenship) {
        setCitizenshipCode(null);
        setCitizenshipCountry(null);
        setTaxStatuses([]);
        return;
      }

      setCitizenshipCode(citizenship.countryCode);
      setCitizenshipCountry(citizenship.country);

      const hasFixedResidence = await getHasFixedResidence(user.uid);
      const trips = await getAllTripsRaw();
      const statuses = calculateAllTaxStatuses(
        trips,
        citizenship.countryCode,
        hasFixedResidence ?? true,
        year,
      );
      setAvailableYears(availableYearsFromTrips(trips));
      setTaxStatuses(statuses);
    } catch (error) {
      console.error('Failed to load tax statuses:', error);
    } finally {
      if (!initialised.current) { initialised.current = true; setReady(true); }
    }
  }, [user, year]);

  // Re-run whenever the year changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return {
    taxStatuses,
    availableYears,
    loading: !ready,
    citizenshipCode,
    citizenshipCountry,
    refresh,
  };
}
