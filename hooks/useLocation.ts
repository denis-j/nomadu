import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  checkLocationPermissions,
  foregroundLocationCheck,
  isTrackingActive,
  startBackgroundTracking,
  stopBackgroundTracking,
} from '../lib/location';

export function useLocation() {
  const [permissions, setPermissions] = useState({ foreground: false, background: false, isAlways: false });
  const [tracking, setTracking] = useState(false);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);

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

  // Refresh permission/tracking status when returning to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        refresh();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
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
          // Immediately check location on first enable
          foregroundLocationCheck();
        }
      }
    } catch (error) {
      console.error('Failed to toggle tracking:', error);
    }
  }, [tracking]);

  return { permissions, tracking, loading, toggleTracking, refresh };
}
