import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getAllTrips, Trip } from '../lib/database';
import { getTripsCache } from '../lib/prefetch';

export function useTrips() {
  const cached = getTripsCache();
  const [trips, setTrips] = useState<Trip[]>(cached ?? []);
  const [ready, setReady] = useState(cached !== null);
  const initialised = useRef(cached !== null);

  const refresh = useCallback(async () => {
    try {
      const data = await getAllTrips();
      setTrips(data);
    } catch (error) {
      console.error('Failed to load trips:', error);
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

  // Group trips by month/year
  const groupedTrips = trips.reduce<Record<string, Trip[]>>((acc, trip) => {
    const date = new Date(trip.start_date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(trip);
    return acc;
  }, {});

  return { trips, groupedTrips, loading: !ready, refresh };
}
