import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getStats, Stats } from '../lib/database';
import { getStatsCache } from '../lib/prefetch';
import { getCitizenship } from '../lib/onboarding';
import { YearFilter } from '../lib/yearFilter';
import { useAuth } from './useAuth';

const EMPTY_STATS: Stats = {
  totalCountries: 0,
  totalCities: 0,
  daysAway: 0,
  daysTracked: 0,
  daysInWindow: 0,
  stops: 0,
  avgStayDays: 0,
  newCountries: 0,
  topCountries: [],
  availableYears: [new Date().getFullYear()],
  allTimeCountryCodes: [],
  daysAwayByMonth: null,
};

/**
 * @param year `null` (default) for all-time; otherwise a calendar year.
 *
 * The citizenship is what "away" is measured against, so the stats wait for it
 * rather than briefly counting home days as travel.
 */
export function useStats(year: YearFilter = null) {
  const { user } = useAuth();
  // Cache is keyed to all-time (year = null). Use it only when no filter is set.
  const cached = year === null ? getStatsCache() : null;
  const [stats, setStats] = useState<Stats>(cached ?? EMPTY_STATS);
  const [home, setHome] = useState<{ code: string; country: string } | null>(null);
  const [ready, setReady] = useState(cached !== null);
  const initialised = useRef(cached !== null);

  useEffect(() => {
    if (!user) return;
    getCitizenship(user.uid).then((c) =>
      setHome(c ? { code: c.countryCode, country: c.country } : null),
    );
  }, [user]);

  const refresh = useCallback(async () => {
    try {
      setStats(await getStats(year, home?.code ?? null));
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      if (!initialised.current) {
        initialised.current = true;
        setReady(true);
      }
    }
  }, [year, home]);

  // Re-fetch immediately when the year filter or the home country changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Also refresh whenever the screen regains focus (existing behaviour)
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return { stats, home, loading: !ready, refresh };
}
