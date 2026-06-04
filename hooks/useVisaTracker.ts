import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from './useAuth';
import { getCitizenship } from '../lib/onboarding';
import { getAllTripsRaw } from '../lib/database';
import { calculateAllVisaStatuses, VisaStatus } from '../lib/visaCalculations';
import { getVisaStatusesCache } from '../lib/prefetch';
import { getAllUserVisas } from '../lib/userVisas';

export function useVisaTracker() {
  const { user } = useAuth();
  const cached = getVisaStatusesCache();
  const [visaStatuses, setVisaStatuses] = useState<VisaStatus[]>(cached ?? []);
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
        setVisaStatuses([]);
        return;
      }

      setCitizenshipCode(citizenship.countryCode);
      setCitizenshipCountry(citizenship.country);

      const [trips, userVisas] = await Promise.all([
        getAllTripsRaw(),
        getAllUserVisas(),
      ]);
      const statuses = calculateAllVisaStatuses(trips, citizenship.countryCode, userVisas);
      setVisaStatuses(statuses);
    } catch (error) {
      console.error('Failed to load visa statuses:', error);
    } finally {
      if (!initialised.current) { initialised.current = true; setReady(true); }
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return { visaStatuses, loading: !ready, citizenshipCode, citizenshipCountry, refresh };
}
