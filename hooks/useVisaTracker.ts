import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getCitizenship } from '../lib/onboarding';
import { getAllTripsRaw, Trip } from '../lib/database';
import { calculateAllVisaStatuses, VisaStatus } from '../lib/visaCalculations';

export function useVisaTracker() {
  const { user } = useAuth();
  const [visaStatuses, setVisaStatuses] = useState<VisaStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [citizenshipCode, setCitizenshipCode] = useState<string | null>(null);
  const [citizenshipCountry, setCitizenshipCountry] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const citizenship = await getCitizenship(user.uid);
      if (!citizenship) {
        setCitizenshipCode(null);
        setCitizenshipCountry(null);
        setVisaStatuses([]);
        return;
      }

      setCitizenshipCode(citizenship.countryCode);
      setCitizenshipCountry(citizenship.country);

      const trips = await getAllTripsRaw();
      const statuses = calculateAllVisaStatuses(trips, citizenship.countryCode);
      setVisaStatuses(statuses);
    } catch (error) {
      console.error('Failed to load visa statuses:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { visaStatuses, loading, citizenshipCode, citizenshipCountry, refresh };
}
