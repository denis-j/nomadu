import { useCallback, useEffect, useState } from 'react';
import {
  checkLocationPermissions,
  isTrackingActive,
  startBackgroundTracking,
  stopBackgroundTracking,
} from '../lib/location';

export function useLocation() {
  const [permissions, setPermissions] = useState({ foreground: false, background: false, isAlways: false });
  const [tracking, setTracking] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const perms = await checkLocationPermissions();
      const active = await isTrackingActive();
      setPermissions(perms);
      setTracking(active);
    } catch (error) {
      console.error('Failed to check location status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleTracking = useCallback(async () => {
    try {
      if (tracking) {
        await stopBackgroundTracking();
        setTracking(false);
      } else {
        const started = await startBackgroundTracking();
        setTracking(started);
        if (started) {
          const perms = await checkLocationPermissions();
          setPermissions(perms);
        }
      }
    } catch (error) {
      console.error('Failed to toggle tracking:', error);
    }
  }, [tracking]);

  return { permissions, tracking, loading, toggleTracking, refresh };
}
