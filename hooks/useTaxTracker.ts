import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from './useAuth';
import { getCitizenship, getHasFixedResidence } from '../lib/onboarding';
import { getAllTripsRaw } from '../lib/database';
import { calculateAllTaxStatuses, TaxStatus } from '../lib/taxCalculations';
import { getTaxStatusesCache } from '../lib/prefetch';

export function useTaxTracker() {
  const { user } = useAuth();
  const cached = getTaxStatusesCache();
  const [taxStatuses, setTaxStatuses] = useState<TaxStatus[]>(cached ?? []);
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
      const statuses = calculateAllTaxStatuses(trips, citizenship.countryCode, hasFixedResidence ?? true);
      setTaxStatuses(statuses);
    } catch (error) {
      console.error('Failed to load tax statuses:', error);
    } finally {
      if (!initialised.current) { initialised.current = true; setReady(true); }
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return { taxStatuses, loading: !ready, citizenshipCode, citizenshipCountry, refresh };
}
