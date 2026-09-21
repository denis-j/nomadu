import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  getAccommodationForStop,
  getAccommodationsForJourney,
  type LocalAccommodation,
} from '../lib/accommodations';

/**
 * The accommodation plans of one journey, by stop sync id, refreshed when
 * the screen regains focus (an agent may have written one meanwhile; the
 * realtime sync puts it in SQLite, focus puts it on screen).
 */
export function useJourneyAccommodations(journeySyncId: string | null | undefined) {
  const [plans, setPlans] = useState<Map<string, LocalAccommodation>>(new Map());

  const refresh = useCallback(async () => {
    if (!journeySyncId) return;
    try {
      setPlans(await getAccommodationsForJourney(journeySyncId));
    } catch (error) {
      console.error('Failed to load accommodation plans:', error);
    }
  }, [journeySyncId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { plans, refresh };
}

/** One stop's plan, or null while nothing has been planned. */
export function useAccommodation(stopSyncId: string | null | undefined) {
  const [plan, setPlan] = useState<LocalAccommodation | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Another stop, another plan: never show the previous one meanwhile.
  useEffect(() => {
    setPlan(null);
    setLoaded(false);
  }, [stopSyncId]);

  const refresh = useCallback(async () => {
    if (!stopSyncId) {
      setLoaded(true);
      return;
    }
    try {
      setPlan(await getAccommodationForStop(stopSyncId));
    } catch (error) {
      console.error('Failed to load accommodation plan:', error);
    } finally {
      setLoaded(true);
    }
  }, [stopSyncId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { plan, loaded, refresh, setPlan };
}
