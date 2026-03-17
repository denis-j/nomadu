import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  getAllTripsForSync,
  setSyncId,
  upsertTripFromCloud,
  type Trip,
} from './database';

const CLOUD_SYNC_KEY = (uid: string) => `@cloud_sync_enabled_${uid}`;
const LAST_SYNC_KEY = (uid: string) => `@last_sync_${uid}`;

// ─── Preferences ───

export async function getCloudSyncEnabled(uid: string): Promise<boolean> {
  const value = await AsyncStorage.getItem(CLOUD_SYNC_KEY(uid));
  return value === 'true';
}

export async function setCloudSyncEnabled(uid: string, enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(CLOUD_SYNC_KEY(uid), enabled ? 'true' : 'false');
}

export async function getLastSyncTime(uid: string): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SYNC_KEY(uid));
}

async function setLastSyncTime(uid: string): Promise<void> {
  await AsyncStorage.setItem(LAST_SYNC_KEY(uid), new Date().toISOString());
}

// ─── Push (local → cloud) ───

function tripsCollection(uid: string) {
  return collection(db, 'users', uid, 'trips');
}

export async function pushTripsToCloud(uid: string): Promise<void> {
  const trips = await getAllTripsForSync();

  for (const trip of trips) {
    const syncId = trip.sync_id || `local_${trip.id}`;
    const docRef = doc(tripsCollection(uid), syncId);

    await setDoc(docRef, {
      city: trip.city,
      country: trip.country,
      country_code: trip.country_code,
      latitude: trip.latitude,
      longitude: trip.longitude,
      start_date: trip.start_date,
      end_date: trip.end_date,
      days: trip.days,
      local_id: trip.id,
      updated_at: trip.updated_at
        ? Timestamp.fromDate(new Date(trip.updated_at))
        : Timestamp.now(),
      deleted: trip.deleted === 1,
    }, { merge: true });

    if (!trip.sync_id) {
      await setSyncId(trip.id, syncId);
    }
  }
}

// ─── Pull (cloud → local) ───

export async function pullTripsFromCloud(uid: string): Promise<void> {
  const snapshot = await getDocs(tripsCollection(uid));

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const updatedAt = data.updated_at instanceof Timestamp
      ? data.updated_at.toDate().toISOString()
      : new Date().toISOString();

    await upsertTripFromCloud({
      sync_id: docSnap.id,
      city: data.city,
      country: data.country,
      country_code: data.country_code,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      start_date: data.start_date,
      end_date: data.end_date ?? null,
      days: data.days ?? 1,
      updated_at: updatedAt,
      deleted: data.deleted === true,
      local_id: data.local_id ?? null,
    });
  }
}

// ─── Bidirectional Sync ───

export async function syncTrips(uid: string): Promise<void> {
  await pushTripsToCloud(uid);
  await pullTripsFromCloud(uid);
  await setLastSyncTime(uid);
}

// ─── Realtime Listener ───

let activeUnsubscribe: Unsubscribe | null = null;

export function startRealtimeSync(uid: string): Unsubscribe {
  stopRealtimeSync();

  const unsubscribe = onSnapshot(tripsCollection(uid), async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      if (change.type === 'added' || change.type === 'modified') {
        const data = change.doc.data();
        const updatedAt = data.updated_at instanceof Timestamp
          ? data.updated_at.toDate().toISOString()
          : new Date().toISOString();

        await upsertTripFromCloud({
          sync_id: change.doc.id,
          city: data.city,
          country: data.country,
          country_code: data.country_code,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          start_date: data.start_date,
          end_date: data.end_date ?? null,
          days: data.days ?? 1,
          updated_at: updatedAt,
          deleted: data.deleted === true,
          local_id: data.local_id ?? null,
        });
      }
    }
  });

  activeUnsubscribe = unsubscribe;
  return unsubscribe;
}

export function stopRealtimeSync(): void {
  if (activeUnsubscribe) {
    activeUnsubscribe();
    activeUnsubscribe = null;
  }
}
