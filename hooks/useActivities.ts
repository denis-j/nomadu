import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useCloudRefresh } from './useCloudRefresh';
import { getActivitiesForJourney, type LocalActivity } from '../lib/activities';
import { sortActivities } from '../lib/activityModel';

/**
 * What each journey's activities looked like the last time they were read,
 * so the chips are on the stop cards in the first frame when the trip
 * comes back (same as useJourneyAccommodations).
 */
const lastRead = new Map<string, LocalActivity[]>();

/** For when the journeys these ids point to are gone (another account signed in). */
export function forgetActivities(): void {
  lastRead.clear();
}

/**
 * The activities of one journey (its sync id), refreshed on focus and when
 * the cloud wrote something (an agent, a friend). `byStop` groups them by
 * stop sync id; those whose stop is not on the trip (any more) are under
 * `unplaced`, with the ones never placed.
 */
export function useJourneyActivities(journeySyncId: string | null | undefined, stopSyncIds?: (string | null)[]) {
  const key = journeySyncId ?? '';
  const [activities, setActivities] = useState<LocalActivity[]>(() => lastRead.get(key) ?? []);
  const [loaded, setLoaded] = useState(() => lastRead.has(key));

  const refresh = useCallback(async () => {
    if (!journeySyncId) {
      setLoaded(true);
      return;
    }
    try {
      const next = await getActivitiesForJourney(journeySyncId);
      lastRead.set(journeySyncId, next);
      setActivities((prev) => (same(prev, next) ? prev : next));
    } catch (error) {
      console.error('Failed to load activities:', error);
    } finally {
      setLoaded(true);
    }
  }, [journeySyncId]);

  useCloudRefresh(refresh);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const stopsKey = (stopSyncIds ?? []).join('|');
  const grouped = useMemo(() => {
    const stops = new Set((stopsKey ? stopsKey.split('|') : []).filter(Boolean));
    const byStop = new Map<string, LocalActivity[]>();
    const unplaced: LocalActivity[] = [];
    for (const a of activities) {
      if (a.stop_id && stops.has(a.stop_id)) {
        const list = byStop.get(a.stop_id) ?? [];
        list.push(a);
        byStop.set(a.stop_id, list);
      } else {
        unplaced.push(a);
      }
    }
    for (const [id, list] of byStop) byStop.set(id, sortActivities(list));
    return { byStop, unplaced: sortActivities(unplaced) };
  }, [activities, stopsKey]);

  return { activities, byStop: grouped.byStop, unplaced: grouped.unplaced, loaded, refresh, setActivities };
}

function same(a: LocalActivity[], b: LocalActivity[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.id === b[i].id && x.updated_at === b[i].updated_at);
}
