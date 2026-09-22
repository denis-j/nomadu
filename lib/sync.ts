import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  clearAllData,
  clearJourneyShareCodeBySyncId,
  forgetFollowedJourney,
  getAllJourneysForSync,
  getAllTripsForSync,
  getFollowedJourneySyncIds,
  setSyncId,
  syncJourneyMembers,
  upsertJourneyFromCloud,
  upsertTripFromCloud,
  type JourneySyncLeg,
  type JourneySyncTraveller,
  type Trip,
} from './database';
import {
  getAllUserVisasForSync,
  setUserVisaSyncId,
  upsertUserVisaFromCloud,
  type EntriesAllowed,
} from './userVisas';
import {
  getAllAccommodationsForSync,
  replaceFollowedPlans,
  upsertAccommodationFromCloud,
} from './accommodations';
import {
  ACCOMMODATION_STATUSES,
  EMPTY_REQUIREMENTS,
  type AccommodationBooking,
  type AccommodationOption,
  type AccommodationRequirements,
  type AccommodationStatus,
} from './accommodationModel';
import { pullDocumentsFromCloud, pushDocumentsToCloud, watchDocuments } from './documentSync';
import { parseSyncStamp } from './syncTime';
import { clearBadgeProgress } from './badges';
import { reportError } from './monitoring';
import { pushProfileToCloud } from './onboarding';

const LAST_SYNC_KEY = (uid: string) => `@last_sync_${uid}`;

/**
 * There is no switch any more: a signed-in account is a synced account.
 *
 * The phone still writes to SQLite first and reads from it, so everything
 * works with no connection at all; what changes is that the cloud copy is
 * no longer optional, it catches up whenever the phone is back online.
 * Sharing a trip, following a friend's and having the same data on a second
 * phone all depended on a setting most people never found.
 *
 * Old installs may still carry `@cloud_sync_enabled_{uid}`; nothing reads
 * it, and the first sync after the update pushes whatever was local-only.
 */

// ─── Preferences ───

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

function journeysCollection(uid: string) {
  return collection(db, 'users', uid, 'journeys');
}

function visasCollection(uid: string) {
  return collection(db, 'users', uid, 'visas');
}

function accommodationsCollection(uid: string) {
  return collection(db, 'users', uid, 'accommodations');
}

/** Trips shared with friends: one mirror per journey, see functions/src/share.ts. */
function sharedJourneysCollection() {
  return collection(db, 'shared_journeys');
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

    const localUpdatedAt = trip.updated_at ? parseSyncStamp(trip.updated_at) : new Date();

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

// ─── Visas (local ↔ cloud) ───

/**
 * Mirror `user_visas` to `users/<uid>/visas`.
 *
 * Visas are typed in by hand and exist nowhere else: no GPS trail, no import,
 * no way to reconstruct them. Until this existed, a reinstall restored every
 * trip and silently dropped every visa the user had entered.
 *
 * Same shape as the trip push: one read for the whole collection, batched
 * writes, UUID ids minted locally and only persisted after the commit.
 */
export async function pushVisasToCloud(uid: string): Promise<void> {
  const visas = await getAllUserVisasForSync();
  if (visas.length === 0) return;

  const visas_ = visasCollection(uid);

  const snapshot = await getDocs(visas_);
  const cloud = new Map<string, DocumentData>();
  snapshot.forEach((docSnap) => cloud.set(docSnap.id, docSnap.data()));

  const idsToPersist: { visaId: number; syncId: string }[] = [];

  let batch = writeBatch(db);
  let ops = 0;

  const commit = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };

  for (const visa of visas) {
    const needsNewId = !visa.sync_id;
    const syncId = needsNewId ? Crypto.randomUUID() : visa.sync_id!;

    const localUpdatedAt = visa.updated_at ? parseSyncStamp(visa.updated_at) : new Date();

    const cloudData = cloud.get(syncId);
    if (cloudData) {
      const cloudUpdatedAt =
        cloudData.updated_at instanceof Timestamp
          ? cloudData.updated_at.toDate()
          : new Date(0);
      if (cloudUpdatedAt >= localUpdatedAt) continue;
    }

    batch.set(
      doc(visas_, syncId),
      {
        country_code: visa.country_code,
        label: visa.label,
        valid_from: visa.valid_from,
        valid_to: visa.valid_to,
        max_days_per_stay: visa.max_days_per_stay,
        max_days_per_window: visa.max_days_per_window,
        window_days: visa.window_days,
        entries_allowed: visa.entries_allowed,
        notes: visa.notes,
        local_id: visa.id,
        updated_at: Timestamp.fromDate(localUpdatedAt),
        deleted: visa.deleted === 1,
      },
      { merge: true },
    );
    ops++;

    if (needsNewId) idsToPersist.push({ visaId: visa.id, syncId });

    if (ops >= BATCH_LIMIT) await commit();
  }

  await commit();

  for (const { visaId, syncId } of idsToPersist) {
    await setUserVisaSyncId(visaId, syncId);
  }
}

export async function pullVisasFromCloud(uid: string): Promise<void> {
  const snapshot = await getDocs(visasCollection(uid));

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const updatedAt = data.updated_at instanceof Timestamp
      ? data.updated_at.toDate().toISOString()
      : new Date().toISOString();

    await upsertUserVisaFromCloud({
      sync_id: docSnap.id,
      country_code: data.country_code,
      label: data.label,
      valid_from: data.valid_from,
      valid_to: data.valid_to,
      max_days_per_stay: data.max_days_per_stay ?? null,
      max_days_per_window: data.max_days_per_window ?? null,
      window_days: data.window_days ?? null,
      entries_allowed: (data.entries_allowed as EntriesAllowed) ?? 'multiple',
      notes: data.notes ?? null,
      updated_at: updatedAt,
      deleted: data.deleted === true,
    });
  }
}

// ─── Journeys ───
// One document per journey with stops and travellers embedded, compared as
// a whole by the journey's updated_at. Sync ids are assigned locally on
// insert (and by the migration), so nothing has to be written back here.

export async function pushJourneysToCloud(uid: string): Promise<void> {
  const journeys = await getAllJourneysForSync();
  if (journeys.length === 0) return;

  const journeys_ = journeysCollection(uid);
  const snapshot = await getDocs(journeys_);
  const cloud = new Map<string, DocumentData>();
  snapshot.forEach((docSnap) => cloud.set(docSnap.id, docSnap.data()));

  let batch = writeBatch(db);
  let ops = 0;
  const commit = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };

  const mirrors: { syncId: string; data: DocumentData }[] = [];
  for (const journey of journeys) {
    // A friend's trip is theirs: followed here, never pushed as ours.
    if (journey.shared_owner_uid) continue;
    const localUpdatedAt = journey.updated_at ? parseSyncStamp(journey.updated_at) : new Date();
    const cloudData = cloud.get(journey.sync_id);
    if (cloudData) {
      const cloudUpdatedAt = cloudData.updated_at instanceof Timestamp ? cloudData.updated_at.toDate() : new Date(0);
      if (cloudUpdatedAt >= localUpdatedAt) continue;
    }
    // No merge: a stop removed locally must disappear from the array too.
    const data = {
      title: journey.title,
      legs: journey.legs,
      travellers: journey.travellers,
      updated_at: Timestamp.fromDate(localUpdatedAt),
      deleted: journey.deleted,
    };
    batch.set(doc(journeys_, journey.sync_id), { ...data, local_id: journey.id });
    ops++;
    if (journey.share_code) mirrors.push({ syncId: journey.sync_id, data: { ...data, owner_uid: uid } });
    if (ops >= BATCH_LIMIT) await commit();
  }
  await commit();

  // The mirror the friends follow. Written one by one, outside the batch:
  // a mirror whose sharing was stopped meanwhile is refused by the rules,
  // and that must not take the journey itself down with it.
  for (const { syncId, data } of mirrors) {
    try {
      await setDoc(doc(sharedJourneysCollection(), syncId), data, { merge: true });
    } catch (err) {
      await clearJourneyShareCodeBySyncId(syncId);
      reportError(err, 'sync:journey-mirror');
    }
  }
}

function journeyFromDoc(id: string, data: DocumentData) {
  const updatedAt = data.updated_at instanceof Timestamp
    ? data.updated_at.toDate().toISOString()
    : new Date().toISOString();
  return {
    sync_id: id,
    title: String(data.title ?? 'Trip'),
    updated_at: updatedAt,
    deleted: data.deleted === true,
    legs: (Array.isArray(data.legs) ? data.legs : []) as JourneySyncLeg[],
    travellers: (Array.isArray(data.travellers) ? data.travellers : []) as JourneySyncTraveller[],
  };
}

export async function pullJourneysFromCloud(uid: string): Promise<void> {
  const snapshot = await getDocs(journeysCollection(uid));
  for (const docSnap of snapshot.docs) {
    await upsertJourneyFromCloud(journeyFromDoc(docSnap.id, docSnap.data()));
  }
}

// ─── Trips shared with friends ───
// Two views of `shared_journeys`: the trips this account follows (a member
// of), which land in the local journeys table read-only; and the trips this
// account shares, whose members become travellers so the owner sees who is
// coming and the friends see their own name in the wallet.

function sharedOwnerOf(data: DocumentData) {
  return { uid: String(data.owner_uid ?? ''), name: String(data.owner_name ?? 'A friend') };
}

function membersOf(data: DocumentData): { uid: string; name: string }[] {
  const members = (data.members ?? {}) as Record<string, { name?: unknown }>;
  return Object.entries(members).map(([uid, m]) => ({ uid, name: typeof m?.name === 'string' && m.name.trim() ? m.name.trim() : 'Friend' }));
}

async function takeFollowedJourney(id: string, data: DocumentData): Promise<void> {
  await upsertJourneyFromCloud(journeyFromDoc(id, data), sharedOwnerOf(data));
  if (data.deleted !== true) await replaceFollowedPlans(id, followedPlansOf(data));
}

export async function pullSharedJourneysFromCloud(uid: string): Promise<void> {
  const snapshot = await getDocs(query(sharedJourneysCollection(), where('member_uids', 'array-contains', uid)));
  const seen = new Set<string>();
  for (const docSnap of snapshot.docs) {
    seen.add(docSnap.id);
    await takeFollowedJourney(docSnap.id, docSnap.data());
  }
  // Followed here but no longer shared with us: the owner stopped, or we left.
  for (const syncId of await getFollowedJourneySyncIds()) {
    if (!seen.has(syncId)) await forgetFollowedJourney(syncId);
  }
}

/** Owner side: friends who joined become travellers on the trip. */
export async function pullMembersFromCloud(uid: string): Promise<void> {
  const snapshot = await getDocs(query(sharedJourneysCollection(), where('owner_uid', '==', uid)));
  for (const docSnap of snapshot.docs) {
    await syncJourneyMembers(docSnap.id, membersOf(docSnap.data()), uid);
  }
}

// ─── Accommodation plans ───
// One document per stop with the options embedded, compared as a whole by
// updated_at; the document id is the stop's sync id. This is what the agent
// API reads and writes when it researches places, so it is pulled after the
// journeys it belongs to.

export async function pushAccommodationsToCloud(uid: string): Promise<void> {
  const plans = await getAllAccommodationsForSync();
  if (plans.length === 0) return;

  const plans_ = accommodationsCollection(uid);
  const snapshot = await getDocs(plans_);
  const cloud = new Map<string, DocumentData>();
  snapshot.forEach((docSnap) => cloud.set(docSnap.id, docSnap.data()));

  let batch = writeBatch(db);
  let ops = 0;
  const commit = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };

  for (const plan of plans) {
    const localUpdatedAt = parseSyncStamp(plan.updated_at);
    const cloudData = cloud.get(plan.id);
    if (cloudData) {
      const cloudUpdatedAt = cloudData.updated_at instanceof Timestamp ? cloudData.updated_at.toDate() : new Date(0);
      if (cloudUpdatedAt >= localUpdatedAt) continue;
    }
    // No merge: an option removed here must disappear from the array too.
    batch.set(doc(plans_, plan.id), {
      journey_id: plan.journey_id,
      stop_id: plan.stop_id,
      needed: plan.needed,
      status: plan.status,
      check_in: plan.check_in,
      check_out: plan.check_out,
      requirements: plan.requirements,
      options: plan.options,
      selected_option_id: plan.selected_option_id,
      booking: plan.booking,
      notes: plan.notes,
      local_id: plan.local_id,
      updated_at: Timestamp.fromDate(localUpdatedAt),
      deleted: plan.deleted,
    });
    ops++;
    if (ops >= BATCH_LIMIT) await commit();
  }
  await commit();
  await mirrorAccommodations(plans.filter((p) => !p.deleted));
}

/** What the mirror last got per shared trip, so an unchanged set is not written again. */
const mirroredPlans = new Map<string, string>();

/**
 * The plans of a shared trip, into its mirror, so the friends see where
 * everyone sleeps. The whole set every time (`updateDoc` replaces the map,
 * a removed plan disappears), skipped when nothing about it changed.
 */
async function mirrorAccommodations(plans: { id: string; journey_id: string; updated_at: string }[]): Promise<void> {
  const shared = (await getAllJourneysForSync()).filter((j) => j.share_code && !j.shared_owner_uid && !j.deleted);
  for (const journey of shared) {
    const mine = plans.filter((p) => p.journey_id === journey.sync_id);
    const stamp = mine.map((p) => `${p.id}@${p.updated_at}`).sort().join('|');
    if (mirroredPlans.get(journey.sync_id) === stamp) continue;
    const map: Record<string, unknown> = {};
    for (const p of mine) {
      const { id, journey_id, updated_at, ...rest } = p as any;
      map[id] = { ...rest, id, journey_id, updated_at };
    }
    try {
      await updateDoc(doc(sharedJourneysCollection(), journey.sync_id), { accommodations: map });
      mirroredPlans.set(journey.sync_id, stamp);
    } catch (err) {
      reportError(err, 'sync:accommodation-mirror');
    }
  }
}

/** The plans in a shared trip's mirror, as the friend's phone stores them. */
function followedPlansOf(data: DocumentData) {
  const map = (data.accommodations ?? {}) as Record<string, DocumentData>;
  return Object.entries(map).map(([id, x]) => {
    const updatedAt = x.updated_at instanceof Timestamp ? x.updated_at.toDate().toISOString() : typeof x.updated_at === 'string' ? x.updated_at : new Date().toISOString();
    const plan = accommodationFromDoc(id, { ...x, updated_at: null });
    return { ...plan, updated_at: updatedAt };
  }).filter((p) => p.check_in && p.check_out && p.journey_id);
}

function accommodationFromDoc(id: string, data: DocumentData) {
  const updatedAt = data.updated_at instanceof Timestamp
    ? data.updated_at.toDate().toISOString()
    : new Date().toISOString();
  return {
    id,
    journey_id: String(data.journey_id ?? ''),
    stop_id: String(data.stop_id ?? id),
    needed: data.needed !== false,
    status: (ACCOMMODATION_STATUSES as readonly string[]).includes(data.status) ? (data.status as AccommodationStatus) : 'open',
    check_in: String(data.check_in ?? ''),
    check_out: String(data.check_out ?? ''),
    requirements: { ...EMPTY_REQUIREMENTS, ...(data.requirements ?? {}) } as AccommodationRequirements,
    options: (Array.isArray(data.options) ? data.options : []) as AccommodationOption[],
    selected_option_id: typeof data.selected_option_id === 'string' ? data.selected_option_id : null,
    booking: (data.booking ?? null) as AccommodationBooking | null,
    notes: typeof data.notes === 'string' ? data.notes : null,
    updated_at: updatedAt,
    deleted: data.deleted === true,
  };
}

export async function pullAccommodationsFromCloud(uid: string): Promise<void> {
  const snapshot = await getDocs(accommodationsCollection(uid));
  for (const docSnap of snapshot.docs) {
    const plan = accommodationFromDoc(docSnap.id, docSnap.data());
    // A document without dates cannot be stored (NOT NULL); nothing writes
    // one, but a hand-edited document must not break the whole pull.
    if (!plan.deleted && (!plan.check_in || !plan.check_out || !plan.journey_id)) continue;
    await upsertAccommodationFromCloud(plan);
  }
}

// ─── Bidirectional Sync ───

/**
 * Trips, visas and journeys, both directions. Pull first so cloud data is
 * never overwritten by an empty or stale local database, which is exactly
 * the state right after a reinstall.
 */
export async function syncAll(uid: string): Promise<void> {
  await pullTripsFromCloud(uid);
  await pushTripsToCloud(uid);
  await pullVisasFromCloud(uid);
  await pushVisasToCloud(uid);
  await pullJourneysFromCloud(uid);
  await pullMembersFromCloud(uid);
  await pushJourneysToCloud(uid);
  await pullSharedJourneysFromCloud(uid);
  await pullAccommodationsFromCloud(uid);
  await pushAccommodationsToCloud(uid);
  await pullDocumentsFromCloud(uid);
  await pushDocumentsToCloud(uid);
  await pushProfileToCloud(uid);
  await setLastSyncTime(uid);
}

/**
 * Only what this phone changed, pushed. Run a moment after a local edit
 * (see `syncTrigger`), so a stop moved here reaches the friends following
 * the trip, and the agent, without waiting for the next app start. Plans
 * and accommodation only: the timeline has its own rhythm.
 */
export async function pushPlans(uid: string): Promise<void> {
  await pushJourneysToCloud(uid);
  await pushAccommodationsToCloud(uid);
  await pushDocumentsToCloud(uid);
}

// ─── Realtime Listener ───

let activeUnsubscribe: Unsubscribe | null = null;

/** Screens showing a wallet register here to re-read when a shared document lands. */
const documentListeners = new Set<() => void>();
export function onDocumentsChanged(fn: () => void): () => void {
  documentListeners.add(fn);
  return () => { documentListeners.delete(fn); };
}
function notifyDocumentsChanged(): void {
  documentListeners.forEach((fn) => fn());
}

export function startRealtimeSync(uid: string): Unsubscribe {
  stopRealtimeSync();

  // Journeys: what an agent or another device writes shows up without a
  // restart. Documents of the same journey edited here in the meantime keep
  // winning through the updated_at comparison in the upsert.
  const unsubscribeJourneys = onSnapshot(journeysCollection(uid), async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      if (change.type === 'added' || change.type === 'modified') {
        try {
          await upsertJourneyFromCloud(journeyFromDoc(change.doc.id, change.doc.data()));
        } catch (err) {
          reportError(err, 'sync:journeys-realtime');
        }
      }
    }
  });

  // Accommodation plans: the agent's research lands on the phone while the
  // trip is open, same as its stops.
  const unsubscribeAccommodations = onSnapshot(accommodationsCollection(uid), async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      if (change.type === 'added' || change.type === 'modified') {
        try {
          const plan = accommodationFromDoc(change.doc.id, change.doc.data());
          if (!plan.deleted && (!plan.check_in || !plan.check_out || !plan.journey_id)) continue;
          await upsertAccommodationFromCloud(plan);
        } catch (err) {
          reportError(err, 'sync:accommodations-realtime');
        }
      }
    }
  });

  // Trips followed: a friend's edit shows up here; a trip no longer shared
  // with us leaves the query and is tombstoned.
  const unsubscribeFollowed = onSnapshot(query(sharedJourneysCollection(), where('member_uids', 'array-contains', uid)), async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      try {
        if (change.type === 'removed') {
          await forgetFollowedJourney(change.doc.id);
        } else {
          await takeFollowedJourney(change.doc.id, change.doc.data());
        }
      } catch (err) {
        reportError(err, 'sync:followed-realtime');
      }
    }
  });

  // Trips shared: a friend joining becomes a traveller within seconds. A
  // mirror that disappeared means sharing was stopped, from here or through
  // account deletion.
  const unsubscribeShared = onSnapshot(query(sharedJourneysCollection(), where('owner_uid', '==', uid)), async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      try {
        if (change.type === 'removed') {
          await clearJourneyShareCodeBySyncId(change.doc.id);
        } else {
          await syncJourneyMembers(change.doc.id, membersOf(change.doc.data()), uid);
        }
      } catch (err) {
        reportError(err, 'sync:shared-realtime');
      }
    }
  });

  const unsubscribeTrips = onSnapshot(tripsCollection(uid), async (snapshot) => {
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

  // Documents of shared trips: one listener per trip, set up once the
  // trips are known. `notifyDocumentsChanged` wakes the open wallet.
  let unsubscribeDocuments: Unsubscribe | null = null;
  let stopped = false;
  watchDocuments(uid, notifyDocumentsChanged).then((u) => {
    if (stopped) u();
    else unsubscribeDocuments = u;
  }).catch((err) => reportError(err, 'sync:documents-watch'));

  const unsubscribe: Unsubscribe = () => {
    stopped = true;
    unsubscribeTrips();
    unsubscribeJourneys();
    unsubscribeAccommodations();
    unsubscribeFollowed();
    unsubscribeShared();
    unsubscribeDocuments?.();
  };
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
