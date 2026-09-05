import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  clearAllData,
  getAllTripsForSync,
  setSyncId,
  upsertTripFromCloud,
  type Trip,
} from './database';
import { clearBadgeProgress } from './badges';

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

/**
 * Cloud ids of the form `local_<rowid>`, as handed out by earlier versions.
 *
 * The rowid comes from each device's own SQLite autoincrement, so two devices
 * both call their first trip `local_1` and silently overwrite one another in
 * the cloud. Any id in this shape is replaced with a UUID on the next push.
 */
const LEGACY_ID_PREFIX = 'local_';

/** Firestore commits at most 500 operations per batch. */
const BATCH_LIMIT = 500;

function isLegacySyncId(syncId: string | null | undefined): syncId is string {
  return typeof syncId === 'string' && syncId.startsWith(LEGACY_ID_PREFIX);
}

export async function pushTripsToCloud(uid: string): Promise<void> {
  const trips = await getAllTripsForSync();
  if (trips.length === 0) return;

  const trips_ = tripsCollection(uid);

  // One read for the whole collection. The previous version fetched each trip
  // individually before deciding whether to write it, so a user with 200 trips
  // paid 200 document reads and 200 sequential round trips on every sync, and
  // a sync runs on every app start.
  const snapshot = await getDocs(trips_);
  const cloud = new Map<string, DocumentData>();
  snapshot.forEach((docSnap) => cloud.set(docSnap.id, docSnap.data()));

  // Written to SQLite only after the batch commits, so a failed push cannot
  // leave a local row pointing at a cloud document that was never created.
  const idsToPersist: { tripId: number; syncId: string }[] = [];

  let batch = writeBatch(db);
  let ops = 0;

  const commit = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };

  for (const trip of trips) {
    const legacyId = isLegacySyncId(trip.sync_id) ? trip.sync_id : null;
    const needsNewId = !trip.sync_id || legacyId !== null;
    const syncId = needsNewId ? Crypto.randomUUID() : trip.sync_id!;

    const localUpdatedAt = trip.updated_at ? new Date(trip.updated_at) : new Date();

    // A freshly minted UUID is never in `cloud`, so this only skips trips that
    // already had a stable id and whose cloud copy is at least as new.
    const cloudData = cloud.get(syncId);
    if (cloudData) {
      const cloudUpdatedAt =
        cloudData.updated_at instanceof Timestamp
          ? cloudData.updated_at.toDate()
          : new Date(0);
      if (cloudUpdatedAt >= localUpdatedAt) continue;
    }

    batch.set(
      doc(trips_, syncId),
      {
        city: trip.city,
        country: trip.country,
        country_code: trip.country_code,
        latitude: trip.latitude,
        longitude: trip.longitude,
        start_date: trip.start_date,
        end_date: trip.end_date,
        days: trip.days,
        local_id: trip.id,
        updated_at: Timestamp.fromDate(localUpdatedAt),
        deleted: trip.deleted === 1,
      },
      { merge: true },
    );
    ops++;

    // Drop the colliding document, or the next pull would bring the trip back
    // a second time under its old id.
    if (legacyId) {
      batch.delete(doc(trips_, legacyId));
      ops++;
    }

    if (needsNewId) idsToPersist.push({ tripId: trip.id, syncId });

    if (ops >= BATCH_LIMIT - 1) await commit();
  }

  await commit();

  for (const { tripId, syncId } of idsToPersist) {
    await setSyncId(tripId, syncId);
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
  // Pull first so cloud data is never overwritten by an empty/stale local DB
  await pullTripsFromCloud(uid);
  await pushTripsToCloud(uid);
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

// ─── Wipe travel data (trips + visits), local + cloud. Plans are preserved. ───

export async function clearAllTravelData(uid: string | null): Promise<void> {
  // Stop realtime sync so cloud deletions don't race with re-inserts
  stopRealtimeSync();

  if (uid) {
    const tripsSnap = await getDocs(tripsCollection(uid));
    await Promise.all(tripsSnap.docs.map((d) => deleteDoc(d.ref)));
    await AsyncStorage.removeItem(LAST_SYNC_KEY(uid));
  }

  await clearAllData();
  await clearBadgeProgress();
}
