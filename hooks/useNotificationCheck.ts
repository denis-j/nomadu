import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './useAuth';
import { getCitizenship, getHasFixedResidence } from '../lib/onboarding';
import { getAllTripsRaw } from '../lib/database';
import { calculateAllVisaStatuses } from '../lib/visaCalculations';
import { calculateAllTaxStatuses } from '../lib/taxCalculations';
import { checkAndNotifyVisaTax } from '../lib/notifications';

export function useNotificationCheck() {
  const { user } = useAuth();
  const lastCheck = useRef<number>(0);

  const runCheck = async () => {
    if (!user) return;
    // Debounce: at most once every 6 hours
    const now = Date.now();
    if (now - lastCheck.current < 6 * 60 * 60 * 1000) return;
    lastCheck.current = now;

    try {
      const citizenship = await getCitizenship(user.uid);
      if (!citizenship) return;

      const hasFixedResidence = await getHasFixedResidence(user.uid);
      const trips = await getAllTripsRaw();

      const visaStatuses = calculateAllVisaStatuses(trips, citizenship.countryCode);
      const taxStatuses = calculateAllTaxStatuses(trips, citizenship.countryCode, hasFixedResidence ?? true);

      await checkAndNotifyVisaTax(visaStatuses, taxStatuses);
    } catch (err) {
      console.error('Notification check failed:', err);
    }
  };

  useEffect(() => {
    runCheck();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') runCheck();
    });

    return () => sub.remove();
  }, [user]);
}
