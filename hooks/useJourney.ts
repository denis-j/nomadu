import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getJourneyWithLegs, JourneyWithLegs } from '../lib/database';

export function useJourney(id: number) {
  const [journey, setJourney] = useState<JourneyWithLegs | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getJourneyWithLegs(id);
      setJourney(data);
    } catch (error) {
      console.error('Failed to load journey:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { journey, loading, refresh, setJourney };
}
