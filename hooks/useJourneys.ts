import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getAllJourneys, Journey } from '../lib/database';
import { getJourneysCache } from '../lib/prefetch';

export function useJourneys() {
  const cached = getJourneysCache();
  const [journeys, setJourneys] = useState<Journey[]>(cached ?? []);
  const [ready, setReady] = useState(cached !== null);
  const initialised = useRef(cached !== null);

  const refresh = useCallback(async () => {
    try {
      const data = await getAllJourneys();
      setJourneys(data);
    } catch (error) {
      console.error('Failed to load journeys:', error);
    } finally {
      if (!initialised.current) {
        initialised.current = true;
        setReady(true);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { journeys, loading: !ready, refresh };
}
