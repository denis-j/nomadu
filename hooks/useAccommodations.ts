import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useCloudRefresh } from './useCloudRefresh';
import {
  getAccommodationForStop,
  getAccommodationsForJourney,
  type LocalAccommodation,
} from '../lib/accommodations';

/**
 * What each journey's plans looked like the last time they were read, so a
 * screen that comes back shows its stay chips in its first frame instead of
 * a frame later; the read that follows only changes what changed.
 */
const lastPlans = new Map<number, Map<string, LocalAccommodation>>();

/** For when the journeys these ids point to are gone (another account signed in). */
export function forgetAccommodationPlans(): void {
  lastPlans.clear();
}

/**
 * The accommodation plans of one journey (its local id), by stop sync id,
 * read alongside the journey itself and refreshed when the screen regains
 * focus (an agent may have written one meanwhile; the realtime sync puts
 * it in SQLite, focus puts it on screen). `loaded` is false until the
 * first read is in, so the caller can hold the list back that long rather
 * than let the chips pop in a frame after the cards.
 */
export function useJourneyAccommodations(journeyId: number) {
  const [plans, setPlans] = useState<Map<string, LocalAccommodation>>(() => lastPlans.get(journeyId) ?? new Map());
  const [loaded, setLoaded] = useState(() => lastPlans.has(journeyId));

  const refresh = useCallback(async () => {
    try {
      const next = await getAccommodationsForJourney(journeyId);
      lastPlans.set(journeyId, next);
      // Same plans as before: keep the same Map, so nothing downstream re-renders.
      setPlans((prev) => (samePlans(prev, next) ? prev : next));
    } catch (error) {
      console.error('Failed to load accommodation plans:', error);
    } finally {
      setLoaded(true);
    }
  }, [journeyId]);

  useCloudRefresh(refresh);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { plans, loaded, refresh };
}

function samePlans(a: Map<string, LocalAccommodation>, b: Map<string, LocalAccommodation>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, plan] of a) {
    const other = b.get(id);
    if (!other || other.updated_at !== plan.updated_at) return false;
  }
  return true;
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

  useCloudRefresh(refresh);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { plan, loaded, refresh, setPlan };
}
