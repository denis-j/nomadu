import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useCloudRefresh } from './useCloudRefresh';
import { getJourneyWithLegs, JourneyWithLegs } from '../lib/database';

/**
 * One journey with its stops, re-read whenever the screen regains focus.
 *
 * `loading` is true only until the first read: a re-read on focus keeps
 * what is on screen until the fresh data replaces it. Flipping it back to
 * true made the empty state give way to the (empty) list and return a
 * moment later every time a sheet closed, which read as a flicker.
 */
export function useJourney(id: number) {
  const [journey, setJourney] = useState<JourneyWithLegs | null>(null);
  const [loading, setLoading] = useState(true);

  // Another journey: back to the loading state until it is in.
  useEffect(() => {
    setJourney(null);
    setLoading(true);
  }, [id]);

  const refresh = useCallback(async () => {
    try {
      const data = await getJourneyWithLegs(id);
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
