import { useCallback, useEffect, useState } from 'react';
import { getStats, Stats } from '../lib/database';

export function useStats() {
  const [stats, setStats] = useState<Stats>({
    totalCountries: 0,
    totalCities: 0,
    totalDays: 0,
    topCountries: [],
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, loading, refresh };
}
