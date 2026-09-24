import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useCloudRefresh } from './useCloudRefresh';
import { getStats, Stats } from '../lib/database';
import { getCitizenshipCache, getStatsCache } from '../lib/prefetch';
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
 * rather than briefly counting home days as travel. The prefetched one is
 * there from the first frame; without it nothing is computed until it is read.
 */
export function useStats(year: YearFilter = null) {
  const { user } = useAuth();
  // Cache is keyed to all-time (year = null). Use it only when no filter is set.
  // It was computed with the citizenship (lib/prefetch.ts), so it can be shown as is.
  const cached = year === null ? getStatsCache() : null;
  const cachedHome = getCitizenshipCache();
  const [stats, setStats] = useState<Stats>(cached ?? EMPTY_STATS);
  const [home, setHome] = useState<{ code: string; country: string } | null>(
    cachedHome ? { code: cachedHome.countryCode, country: cachedHome.country } : null,
  );
  const [homeLoaded, setHomeLoaded] = useState(cachedHome !== null);
  const [ready, setReady] = useState(cached !== null);
  const initialised = useRef(cached !== null);
  // Signed out there is no citizenship to wait for.
  const homeKnown = homeLoaded || !user;
  const homeCode = home?.code ?? null;

  useEffect(() => {
    if (!user) return;
    getCitizenship(user.uid)
      .then((c) =>
        // Same country as the cached one: keep the object, so nothing recomputes.
        setHome((prev) =>
          prev?.code === c?.countryCode && prev?.country === c?.country
            ? prev
            : c ? { code: c.countryCode, country: c.country } : null,
        ),
      )
      .catch((error) => console.error('Failed to load citizenship:', error))
      .finally(() => setHomeLoaded(true));
  }, [user]);

  const refresh = useCallback(async () => {
    // Numbers without the home country would be shown and then jump.
    if (!homeKnown) return;
    try {
      setStats(await getStats(year, homeCode));
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      if (!initialised.current) {
        initialised.current = true;
        setReady(true);
      }
    }
  }, [year, homeCode, homeKnown]);

  // Re-fetch immediately when the year filter or the home country changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Also refresh whenever the screen regains focus (existing behaviour)
  useCloudRefresh(refresh);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return { stats, home, loading: !ready, refresh };
}
