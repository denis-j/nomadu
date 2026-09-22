import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { reportError } from '../lib/monitoring';
import {
  getLastSyncTime,
  pushPlans,
  startRealtimeSync,
  stopRealtimeSync,
  syncAll,
} from '../lib/sync';
import { onLocalChange } from '../lib/syncTrigger';

/** How long after the last local edit the push goes out. */
const PUSH_DELAY_MS = 2000;

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

  useEffect(() => {
    if (!user) return;
    getLastSyncTime(user.uid).then(setLastSynced);
  }, [user]);

  useEffect(() => {
    if (!user) {
      stopRealtimeSync();
      return;
    }

    // Initial sync + start listener
    doSync(user.uid);
    startRealtimeSync(user.uid);

    // Local edits go out a couple of seconds after the last one, so a
    // friend following the trip sees the change now, not at the next start.
    const uid = user.uid;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const offChange = onLocalChange(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        pushPlans(uid).catch((err) => reportError(err, 'sync:push-plans'));
      }, PUSH_DELAY_MS);
    });

    return () => {
      offChange();
      if (timer) clearTimeout(timer);
      stopRealtimeSync();
    };
  }, [user]);

  const doSync = useCallback(async (uid: string) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncStatus('syncing');
    try {
      await syncAll(uid);
      const time = await getLastSyncTime(uid);
      setLastSynced(time);
      setSyncStatus('idle');
    } catch (err) {
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
