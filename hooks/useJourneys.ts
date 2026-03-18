import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getAllJourneys, Journey } from '../lib/database';

export function useJourneys() {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAllJourneys();
      setJourneys(data);
    } catch (error) {
      console.error('Failed to load journeys:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { journeys, loading, refresh };
}
