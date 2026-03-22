import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getStats, Stats } from '../lib/database';
import { getStatsCache } from '../lib/prefetch';

const EMPTY_STATS: Stats = { totalCountries: 0, totalCities: 0, totalDays: 0, topCountries: [] };

export function useStats() {
  const cached = getStatsCache();
  const [stats, setStats] = useState<Stats>(cached ?? EMPTY_STATS);
  const [ready, setReady] = useState(cached !== null);
  const initialised = useRef(cached !== null);

  const refresh = useCallback(async () => {
    try {
      const data = await getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
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
    }, [refresh])
  );

  return { stats, loading: !ready, refresh };
}
