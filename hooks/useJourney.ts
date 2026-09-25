import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useCloudRefresh } from './useCloudRefresh';
import { getJourneyWithLegs, JourneyWithLegs } from '../lib/database';
import { journeyDetail, rememberJourney } from '../lib/journeyDetails';

/**
 * One journey with its stops, re-read whenever the screen regains focus.
 *
 * `loading` is true only until the first read: a re-read on focus keeps
 * what is on screen until the fresh data replaces it. Flipping it back to
 * true made the empty state give way to the (empty) list and return a
 * moment later every time a sheet closed, which read as a flicker.
 */
export function useJourney(id: number) {
  // Starts from the last known state (lib/journeyDetails.ts), so the first
  // frame already has the stops.
  const [journey, setJourney] = useState<JourneyWithLegs | null>(() => journeyDetail(id)?.journey ?? null);
  const [loading, setLoading] = useState(() => journeyDetail(id)?.journey === undefined);

  // Another journey: its last known state, or loading until it is in. Only
  // on a change of id: run on mount too, it blanked the cached first frame.
  const [shownId, setShownId] = useState(id);
  if (shownId !== id) {
    setShownId(id);
    const known = journeyDetail(id)?.journey;
    setJourney(known ?? null);
    setLoading(known === undefined);
  }

  const refresh = useCallback(async () => {
    try {
      const data = await getJourneyWithLegs(id);
      rememberJourney(id, data);
      setJourney(data);
    } catch (error) {
      console.error('Failed to load journey:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useCloudRefresh(refresh);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { journey, loading, refresh, setJourney };
}
