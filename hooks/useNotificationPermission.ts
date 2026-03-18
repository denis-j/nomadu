import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { checkNotificationPermissions } from '../lib/notifications';

export function useNotificationPermission() {
  const [granted, setGranted] = useState(true); // optimistic default to avoid flash
  const appState = useRef(AppState.currentState);

  const refresh = useCallback(async () => {
    const ok = await checkNotificationPermissions();
    setGranted(ok);
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        refresh();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [refresh]);

  return { granted };
}
