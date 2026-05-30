import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  getCloudSyncEnabled,
  getLastSyncTime,
  setCloudSyncEnabled as setCloudSyncEnabledStorage,
  startRealtimeSync,
  stopRealtimeSync,
  syncTrips,
} from '../lib/sync';

type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncContextValue {
  cloudSyncEnabled: boolean | null;
  setCloudSyncEnabled: (enabled: boolean) => Promise<void>;
  syncStatus: SyncStatus;
  lastSynced: string | null;
  triggerSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue>({
  cloudSyncEnabled: null,
  setCloudSyncEnabled: async () => {},
  syncStatus: 'idle',
  lastSynced: null,
  triggerSync: async () => {},
});

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [cloudSyncEnabled, setEnabled] = useState<boolean | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const { user } = useAuth();
  const syncingRef = useRef(false);

  // Load preference on mount
  useEffect(() => {
    if (!user) {
      setEnabled(null);
      return;
    }
    getCloudSyncEnabled(user.uid).then(setEnabled);
    getLastSyncTime(user.uid).then(setLastSynced);
  }, [user]);

  // Start/stop realtime sync based on preference
  useEffect(() => {
    if (!user || cloudSyncEnabled !== true) {
      stopRealtimeSync();
      return;
    }

    // Initial sync + start listener
    doSync(user.uid);
    startRealtimeSync(user.uid);

    return () => {
      stopRealtimeSync();
    };
  }, [user, cloudSyncEnabled]);

  const doSync = useCallback(async (uid: string) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncStatus('syncing');
    try {
      await syncTrips(uid);
      const time = await getLastSyncTime(uid);
      setLastSynced(time);
      setSyncStatus('idle');
    } catch (err) {
      console.error('Sync error:', err);
      setSyncStatus('error');
    } finally {
      syncingRef.current = false;
    }
  }, []);

  const setCloudSyncEnabled = useCallback(async (enabled: boolean) => {
    if (!user) return;
    await setCloudSyncEnabledStorage(user.uid, enabled);
    setEnabled(enabled);
    if (enabled) {
      await doSync(user.uid);
    } else {
      stopRealtimeSync();
    }
  }, [user, doSync]);

  const triggerSync = useCallback(async () => {
    if (!user || !cloudSyncEnabled) return;
    await doSync(user.uid);
  }, [user, cloudSyncEnabled, doSync]);

  return (
    <SyncContext.Provider
      value={{ cloudSyncEnabled, setCloudSyncEnabled, syncStatus, lastSynced, triggerSync }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
