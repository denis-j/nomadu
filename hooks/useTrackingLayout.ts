import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** The blocks of the Tracking tab below the big card, in their default order. */
export const TRACKING_SECTIONS = ['tiles', 'tracking', 'chart', 'badges', 'top'] as const;
export type TrackingSection = (typeof TRACKING_SECTIONS)[number];

/** What the big card at the top shows. */
export const HERO_METRICS = ['away', 'countries', 'visa'] as const;
export type HeroMetric = (typeof HERO_METRICS)[number];

export interface TrackingLayout {
  order: TrackingSection[];
  hidden: TrackingSection[];
  hero: HeroMetric;
}

const KEY = '@tracking_layout_v1';
const DEFAULT: TrackingLayout = { order: [...TRACKING_SECTIONS], hidden: [], hero: 'away' };

/** What was stored, cleaned: unknown ids dropped, blocks added since then appended. */
function normalize(raw: unknown): TrackingLayout {
  const r = (raw ?? {}) as Partial<TrackingLayout>;
  const known = (id: unknown): id is TrackingSection => (TRACKING_SECTIONS as readonly unknown[]).includes(id);
  const order = Array.isArray(r.order) ? r.order.filter(known) : [];
  for (const id of TRACKING_SECTIONS) if (!order.includes(id)) order.push(id);
  const hidden = Array.isArray(r.hidden) ? r.hidden.filter(known) : [];
  const hero = (HERO_METRICS as readonly unknown[]).includes(r.hero) ? (r.hero as HeroMetric) : 'away';
  return { order, hidden, hero };
}

// One copy for the whole app, so the sheet and the tab behind it change
// together while the sheet is open.
let current: TrackingLayout = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/**
 * How this person arranged the Tracking tab: which blocks show, in what
 * order, and what the big number is. Kept on the device; it is a preference
 * of this phone, not travel data.
 */
export function useTrackingLayout(): TrackingLayout {
  const [layout, setLayout] = useState(current);
  useEffect(() => {
    const fn = () => setLayout(current);
    listeners.add(fn);
    if (!loaded) {
      loaded = true;
      AsyncStorage.getItem(KEY)
        .then((stored) => {
          if (stored) {
            current = normalize(JSON.parse(stored));
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
  return layout;
}

export function setTrackingLayout(change: Partial<TrackingLayout>): void {
  current = normalize({ ...current, ...change });
  notify();
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {});
}

export function resetTrackingLayout(): void {
  current = DEFAULT;
  notify();
  AsyncStorage.removeItem(KEY).catch(() => {});
}
