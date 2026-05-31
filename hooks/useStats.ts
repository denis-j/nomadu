import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getStats, Stats } from '../lib/database';
import { getStatsCache } from '../lib/prefetch';
import { YearFilter } from '../lib/yearFilter';

const EMPTY_STATS: Stats = {
  totalCountries: 0,
  totalCities: 0,
  totalDays: 0,
  topCountries: [],
  availableYears: [new Date().getFullYear()],
  allTimeCountryCodes: [],
  daysByMonth: null,
};

/**
 * @param year `null` (default) for all-time; otherwise a calendar year.
 */
export function useStats(year: YearFilter = null) {
  // Cache is keyed to all-time (year = null). Use it only when no filter is set.
  const cached = year === null ? getStatsCache() : null;
  const [stats, setStats] = useState<Stats>(cached ?? EMPTY_STATS);
  const [ready, setReady] = useState(cached !== null);
  const initialised = useRef(cached !== null);

  const refresh = useCallback(async () => {
    try {
      const data = await getStats(year);
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      if (!initialised.current) {
        initialised.current = true;
        setReady(true);
      }
    }
  }, [year]);

  // Re-fetch immediately when the year filter changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Also refresh whenever the screen regains focus (existing behaviour)
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return { stats, loading: !ready, refresh };
}
