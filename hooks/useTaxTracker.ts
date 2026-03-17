import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getCitizenship, getHasFixedResidence } from '../lib/onboarding';
import { getAllTripsRaw } from '../lib/database';
import { calculateAllTaxStatuses, TaxStatus } from '../lib/taxCalculations';

export function useTaxTracker() {
  const { user } = useAuth();
  const [taxStatuses, setTaxStatuses] = useState<TaxStatus[]>([]);
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
      );
      setTaxStatuses(statuses);
    } catch (error) {
      console.error('Failed to load tax statuses:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { taxStatuses, loading, citizenshipCode, citizenshipCountry, refresh };
}
