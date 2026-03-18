import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getAllJourneys, Journey } from '../lib/database';

export function useJourneys() {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [ready, setReady] = useState(false);
  const initialised = useRef(false);

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
