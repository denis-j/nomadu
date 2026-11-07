import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** The tabs a person can switch off. Settings is not among them: it is the way back. */
export const HIDEABLE_TABS = ['map', 'timeline', 'plans', 'stats'] as const;
export type HideableTab = (typeof HIDEABLE_TABS)[number];

const KEY = '@hidden_tabs_v1';

// One copy for the app, so the tab bar follows the switch in Settings at once.
let current: HideableTab[] = [];
let loaded = false;
let returnToSettings = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

const clean = (raw: unknown): HideableTab[] =>
  Array.isArray(raw) ? raw.filter((id): id is HideableTab => (HIDEABLE_TABS as readonly unknown[]).includes(id)) : [];

/**
 * The tabs this person switched off in Settings. Kept on the device. At
 * least one of the four stays on, so the app never opens on Settings alone.
 */
export function useHiddenTabs(): HideableTab[] {
  const [hidden, setHidden] = useState(current);
  useEffect(() => {
    const fn = () => setHidden(current);
    listeners.add(fn);
    if (!loaded) {
      loaded = true;
      AsyncStorage.getItem(KEY)
        .then((stored) => {
          if (stored) {
            current = clean(JSON.parse(stored));
            notify();
          }
        })
        .catch(() => {});
    } else {
      fn();
    }
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return hidden;
}

export function setTabHidden(tab: HideableTab, hide: boolean): void {
  const next = hide ? [...new Set([...current, tab])] : current.filter((t) => t !== tab);
  if (next.length >= HIDEABLE_TABS.length) return;
  current = next;
  // Changing the tabs rebuilds the tab bar on its first tab; the layout
  // reads this once and takes the person back to Settings, where they were.
  returnToSettings = true;
  notify();
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {});
}

/** True once after a change made in Settings (see setTabHidden). */
export function consumeReturnToSettings(): boolean {
  const r = returnToSettings;
  returnToSettings = false;
  return r;
}
