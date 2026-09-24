import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { reportError } from '../lib/monitoring';
import {
  getLastSyncTime,
  pushPlans,
  startRealtimeSync,
  stopRealtimeSync,
  syncAll,
} from '../lib/sync';
import { onLocalChange, onTimelineChange } from '../lib/syncTrigger';
import { ensureLocalDataOwner } from '../lib/localOwner';

/** How long after the last local edit the push goes out. */
const PUSH_DELAY_MS = 2000;
/**
 * A trip or visa edit goes out with a full sync, which reads whole
 * collections, so edits are gathered for a while first: adding a trip and
 * fixing its dates a moment later is one sync, not two.
 */
const TIMELINE_DELAY_MS = 15_000;
/** Back in the foreground with nothing changed here: sync if the last one is older than this. */
const FOREGROUND_RESYNC_MS = 30 * 60 * 1000;

type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncContextValue {
  syncStatus: SyncStatus;
  lastSynced: string | null;
  triggerSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue>({
  syncStatus: 'idle',
  lastSynced: null,
  triggerSync: async () => {},
});

/**
 * Sync runs for whoever is signed in. There is no preference to read and
 * none to set: the phone keeps its SQLite copy and the cloud follows, so
 * an offline phone simply catches up later (see lib/sync.ts).
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const { user } = useAuth();
  const syncingRef = useRef(false);
  // A trip or visa changed here since the last successful sync (tracking in
  // the background, an edit), or the last sync failed: both mean the next
  // foreground has something to send.
  const dirtyRef = useRef(false);
  const lastOkRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    getLastSyncTime(user.uid).then(setLastSynced);
  }, [user]);

  useEffect(() => {
    if (!user) {
      stopRealtimeSync();
      return;
    }

    const uid = user.uid;
    let active = true;
    // Nothing leaves the phone until the local data is known to be this
    // account's: on a switch, the previous account's rows would otherwise
    // be pushed into this one before they are wiped.
    const owned = ensureLocalDataOwner(uid);

    // Initial sync + start listener
    owned
      .then(() => {
        if (!active) return;
        doSync(uid);
        startRealtimeSync(uid);
      })
      .catch((err) => {
        reportError(err, 'local-owner');
        if (active) setSyncStatus('error');
      });

    // Local edits go out a couple of seconds after the last one, so a
    // friend following the trip sees the change now, not at the next start.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const offChange = onLocalChange(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        owned
          .then(() => pushPlans(uid))
          .catch((err) => reportError(err, 'sync:push-plans'));
      }, PUSH_DELAY_MS);
    });

    // Trips and visas used to go out only at a cold start, which iOS can
    // put off for days, and a sync that failed offline was never retried.
    // Now: a while after an edit made in the open app, and whenever the app
    // comes back with something unsent, a failure behind it, or a stale sync.
    let timelineTimer: ReturnType<typeof setTimeout> | null = null;
    const offTimeline = onTimelineChange(() => {
      dirtyRef.current = true;
      // Tracking writes while the app is in the background; that waits for
      // the foreground instead of syncing from a background wake.
      if (AppState.currentState !== 'active') return;
      if (timelineTimer) clearTimeout(timelineTimer);
      timelineTimer = setTimeout(() => {
        timelineTimer = null;
        owned.then(() => doSync(uid)).catch(() => {});
      }, TIMELINE_DELAY_MS);
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const stale = Date.now() - lastOkRef.current > FOREGROUND_RESYNC_MS;
      if (dirtyRef.current || stale) owned.then(() => doSync(uid)).catch(() => {});
    });

    return () => {
      active = false;
      offChange();
      offTimeline();
      appState.remove();
      if (timer) clearTimeout(timer);
      if (timelineTimer) clearTimeout(timelineTimer);
      stopRealtimeSync();
    };
  }, [user]);

  const doSync = useCallback(async (uid: string) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncStatus('syncing');
    // Cleared up front: an edit made while this sync runs sets it again and
    // is picked up by the next one.
    dirtyRef.current = false;
    try {
      await ensureLocalDataOwner(uid);
      await syncAll(uid);
      lastOkRef.current = Date.now();
      const time = await getLastSyncTime(uid);
      setLastSynced(time);
      setSyncStatus('idle');
    } catch (err) {
      dirtyRef.current = true;
      // The UI only shows an error pill, so without this the failure is
      // invisible to us: nobody reports "the little dot was orange".
      reportError(err, 'sync');
      setSyncStatus('error');
    } finally {
      syncingRef.current = false;
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (!user) return;
    await doSync(user.uid);
  }, [user, doSync]);

  return (
    <SyncContext.Provider
      value={{ syncStatus, lastSynced, triggerSync }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
