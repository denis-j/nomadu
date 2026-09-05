import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Background OTA update checker.
 *
 * On cold start and on every transition to foreground we ask expo-updates
 * whether a newer JS bundle is available. If yes, we download it silently;
 * `Updates.useUpdates()` flips `isUpdatePending` to true once the new bundle
 * is staged and ready to apply. Caller renders a banner that lets the user
 * apply now (`applyUpdate()`) or defer (next cold start picks it up automatically).
 *
 * Throttled to one check per 30 minutes per app lifetime so we don't hammer
 * the EAS endpoint on every keyboard-induced AppState bounce.
 *
 * No-op when Updates aren't enabled (Expo Go, dev client without EAS update).
 */
const MIN_RECHECK_INTERVAL_MS = 30 * 60 * 1000;

export function useOTAUpdates() {
  const updates = Updates.useUpdates();
  const lastCheckRef = useRef(0);

  useEffect(() => {
    if (!Updates.isEnabled) return;

    const check = async () => {
      const now = Date.now();
      if (now - lastCheckRef.current < MIN_RECHECK_INTERVAL_MS) return;
      lastCheckRef.current = now;

      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
        }
      } catch {
        // Network errors, throttled CDN, dev environment — all non-fatal.
      }
    };

    check();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, []);

  const applyUpdate = useCallback(async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // If reload fails, the staged update still applies on the next cold start.
    }
  }, []);

  return {
    /** A fresh JS bundle has been downloaded and is waiting to be applied. */
    isUpdatePending: updates.isUpdatePending,
    /** Restart the app with the staged bundle. */
    applyUpdate,
  };
}
