import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getAllTrips, Trip } from '../lib/database';

export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getAllTrips();
      setTrips(data);
    } catch (error) {
      console.error('Failed to load trips:', error);
    } finally {
      setLoading(false);
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

  return { trips, groupedTrips, loading, refresh };
}
