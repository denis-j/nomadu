import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  Timestamp,
  collection,
  doc,
  documentId,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  markAllTripsDeleted,
  applyMyAvatar,
  getMeta,
  setMeta,
  getTripSyncStamps,
  getInstallId,
  updateJourneyShareCodeBySyncId,
  clearJourneyShareCodeBySyncId,
  getAllJourneysForSync,
  getAllTripsForSync,
  getFollowedJourneySyncIds,
  setSyncId,
  syncJourneyMembers,
  upsertJourneyFromCloud,
  upsertTripFromCloud,
  type JourneySyncLeg,
  type JourneySyncTraveller,
  purgeSyncedTombstones,
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
import { forgetFollowedJourneyWithDocuments } from './documents';
import { localIsNewer, parseSyncStamp } from './syncTime';
import { cloudChanged } from './syncTrigger';
import { clearBadgeProgress } from './badges';
import { reportError } from './monitoring';
import { pullProfileFromCloud, pushProfileToCloud } from './onboarding';
import { getProfile } from './profile';

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

// ─── Reading only what changed ───
//
// Every start used to read each collection whole, three times over: the
// pull, the push (to compare stamps) and the first snapshot of the live
// listener. For a traveller with a few hundred trips that was well over a
// thousand document reads and as many SQLite calls before the phone was
// idle, on every launch.
//
// Now every write carries `synced_at`, set by the server (the device clock
// can be off by any amount, so `updated_at` cannot serve as a cursor). A
// pull asks for what changed since the newest `synced_at` it has seen, the
// listener starts from the same point, and a push looks up only the cloud
// copies of rows edited since its last run. Once a day a full pull runs
// anyway: documents written by app versions from before `synced_at` have no
// such field and are invisible to the query otherwise. The cursors live in
// `app_meta`, which is wiped with the data when another account signs in.

export type SyncedCollection = 'trips' | 'visas' | 'journeys' | 'accommodations';

/** How often a pull reads the whole collection regardless of cursors. */
const FULL_PULL_EVERY_MS = 24 * 60 * 60 * 1000;
/** Overlap on both cursors: a few documents read twice cost less than one missed. */
const CURSOR_MARGIN_MS = 5 * 60 * 1000;
/** Firestore's limit for an `in` filter. */
const IN_LIMIT = 30;

async function pullCursor(name: SyncedCollection): Promise<{ since: Date | null; full: boolean }> {
  const [cursor, lastFull] = await Promise.all([getMeta(`pull_cursor:${name}`), getMeta(`pull_full:${name}`)]);
  const full = !cursor || !lastFull || Date.now() - Date.parse(lastFull) > FULL_PULL_EVERY_MS;
  return { since: cursor ? new Date(Date.parse(cursor) - CURSOR_MARGIN_MS) : null, full };
}

/** The listener's starting point: changes since the last pull, or everything. */
async function listenQuery(name: SyncedCollection, coll: CollectionReference): Promise<Query> {
  const cursor = await getMeta(`pull_cursor:${name}`);
  return cursor
    ? query(coll, where('synced_at', '>', Timestamp.fromDate(new Date(Date.parse(cursor) - CURSOR_MARGIN_MS))))
    : coll;
}

/**
 * The documents a pull has to look at, and what to record once they are
 * applied. The cursor only moves after the caller is done, so a pull that
 * fails half way is repeated from the same point.
 */
async function changedDocs(
  name: SyncedCollection,
  coll: CollectionReference,
): Promise<{ docs: QueryDocumentSnapshot[]; done: () => Promise<void> }> {
  const { since, full } = await pullCursor(name);
  const startedAt = new Date().toISOString();
  const snapshot = full || !since
    ? await getDocs(coll)
    : await getDocs(query(coll, where('synced_at', '>', Timestamp.fromDate(since))));
  if (__DEV__) console.log(`[sync] ${name} pull: ${full || !since ? 'full' : 'changes only'}, ${snapshot.size} documents`);
  let newest = 0;
  for (const d of snapshot.docs) {
    const at = d.data().synced_at;
    if (at instanceof Timestamp) newest = Math.max(newest, at.toMillis());
  }
  return {
    docs: snapshot.docs,
    done: async () => {
      const previous = Date.parse((await getMeta(`pull_cursor:${name}`)) ?? '') || 0;
      await setMeta(`pull_cursor:${name}`, new Date(Math.max(previous, newest)).toISOString());
      if (full) await setMeta(`pull_full:${name}`, startedAt);
    },
  };
}

/**
 * What a push has to consider: rows edited since its last successful run
 * (all rows the first time), and the cloud copies of just those, for the
 * last-write-wins check. `done` moves the mark after the batch committed.
 */
async function pushScope<T>(
  name: SyncedCollection,
  coll: CollectionReference,
  rows: T[],
  syncIdOf: (row: T) => string | null,
  stampOf: (row: T) => string | null,
  alwaysInclude: (row: T) => boolean = () => false,
): Promise<{ rows: T[]; cloud: Map<string, DocumentData>; done: () => Promise<void> }> {
  const mark = await getMeta(`push_mark:${name}`);
  const startedAt = new Date().toISOString();
  const cloud = new Map<string, DocumentData>();

  if (!mark) {
    const snapshot = await getDocs(coll);
    snapshot.forEach((d) => cloud.set(d.id, d.data()));
  } else {
    const since = Date.parse(mark) - CURSOR_MARGIN_MS;
    rows = rows.filter((row) => {
      if (!syncIdOf(row) || alwaysInclude(row)) return true;
      const stamp = stampOf(row);
      return !stamp || parseSyncStamp(stamp).getTime() > since;
    });
    const ids = rows.map(syncIdOf).filter((id): id is string => !!id);
    for (let i = 0; i < ids.length; i += IN_LIMIT) {
      const chunk = ids.slice(i, i + IN_LIMIT);
      const snapshot = await getDocs(query(coll, where(documentId(), 'in', chunk)));
      snapshot.forEach((d) => cloud.set(d.id, d.data()));
    }
  }
  if (__DEV__) console.log(`[sync] ${name} push: ${mark ? 'changed rows' : 'all rows'}, ${rows.length} rows, ${cloud.size} cloud copies read`);
  return { rows, cloud, done: () => setMeta(`push_mark:${name}`, startedAt) };
}

function isLegacySyncId(syncId: string | null | undefined): syncId is string {
  return typeof syncId === 'string' && syncId.startsWith(LEGACY_ID_PREFIX);
}

export async function pushTripsToCloud(uid: string): Promise<void> {
  const allTrips = await getAllTripsForSync();
  if (allTrips.length === 0) return;
  const installId = await getInstallId();

  const trips_ = tripsCollection(uid);

  // Only rows edited since the last push, and only their cloud copies (see
  // pushScope). Legacy ids are always included so they still get re-keyed.
  const scope = await pushScope('trips', trips_, allTrips, (t) => t.sync_id, (t) => t.updated_at, (t) => isLegacySyncId(t.sync_id));
  const trips = scope.rows;
  const cloud = scope.cloud;

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
        install_id: installId,
        updated_at: Timestamp.fromDate(localUpdatedAt),
        synced_at: serverTimestamp(),
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
  await scope.done();
}

// ─── Pull (cloud → local) ───

/**
 * Would this cloud trip change anything here? Nearly every document a pull
 * or the listener's first snapshot delivers is one this phone already holds
 * at the same stamp, or a tombstone for a row it never had. Each of those
 * used to cost its own SQLite round trips, several hundred at every start,
 * right while the first screen was rendering.
 */
function tripBringsNews(stamps: Map<string, string | null>, syncId: string, updatedAt: string, deleted: boolean): boolean {
  if (!stamps.has(syncId)) return !deleted;
  return !localIsNewer(stamps.get(syncId) ?? null, updatedAt);
}

function rememberTripStamp(stamps: Map<string, string | null>, syncId: string, updatedAt: string, deleted: boolean): void {
  if (deleted) stamps.delete(syncId);
  else stamps.set(syncId, updatedAt);
}

export async function pullTripsFromCloud(uid: string): Promise<void> {
  const changed = await changedDocs('trips', tripsCollection(uid));
  const stamps = await getTripSyncStamps();

  for (const docSnap of changed.docs) {
    const data = docSnap.data();
    const updatedAt = data.updated_at instanceof Timestamp
      ? data.updated_at.toDate().toISOString()
      : new Date().toISOString();
    if (!tripBringsNews(stamps, docSnap.id, updatedAt, data.deleted === true)) continue;
    rememberTripStamp(stamps, docSnap.id, updatedAt, data.deleted === true);

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
      install_id: typeof data.install_id === 'string' ? data.install_id : null,
    });
  }
  await changed.done();
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
  const allVisas = await getAllUserVisasForSync();
  if (allVisas.length === 0) return;
  const installId = await getInstallId();

  const visas_ = visasCollection(uid);

  const scope = await pushScope('visas', visas_, allVisas, (v) => v.sync_id, (v) => v.updated_at);
  const visas = scope.rows;
  const cloud = scope.cloud;

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
        install_id: installId,
        updated_at: Timestamp.fromDate(localUpdatedAt),
        synced_at: serverTimestamp(),
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
  await scope.done();
}

export async function pullVisasFromCloud(uid: string): Promise<void> {
  const changed = await changedDocs('visas', visasCollection(uid));

  for (const docSnap of changed.docs) {
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
      local_id: data.local_id ?? null,
      install_id: typeof data.install_id === 'string' ? data.install_id : null,
    });
  }
  await changed.done();
}

// ─── Journeys ───
// One document per journey with stops and travellers embedded, compared as
// a whole by the journey's updated_at. Sync ids are assigned locally on
// insert (and by the migration), so nothing has to be written back here.

export async function pushJourneysToCloud(uid: string): Promise<void> {
  // This account's chosen face onto its own traveller rows first, so the
  // journeys it changes go out in this very push.
  await applyMyAvatar(uid, (await getProfile(uid)).avatar);
  const allJourneys = await getAllJourneysForSync();
  if (allJourneys.length === 0) return;

  const journeys_ = journeysCollection(uid);
  const scope = await pushScope('journeys', journeys_, allJourneys, (j) => j.sync_id, (j) => j.updated_at);
  const journeys = scope.rows;
  const cloud = scope.cloud;

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
    batch.set(doc(journeys_, journey.sync_id), { ...data, local_id: journey.id, synced_at: serverTimestamp() });
    ops++;
    if (journey.share_code) mirrors.push({ syncId: journey.sync_id, data: { ...data, owner_uid: uid } });
    if (ops >= BATCH_LIMIT) await commit();
  }
  await commit();
  await scope.done();

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
  const changed = await changedDocs('journeys', journeysCollection(uid));
  for (const docSnap of changed.docs) {
    await upsertJourneyFromCloud(journeyFromDoc(docSnap.id, docSnap.data()));
  }
  await changed.done();
}

// ─── Trips shared with friends ───
// Two views of `shared_journeys`: the trips this account follows (a member
// of), which land in the local journeys table read-only; and the trips this
// account shares, whose members become travellers so the owner sees who is
// coming and the friends see their own name in the wallet.

function sharedOwnerOf(data: DocumentData) {
  return { uid: String(data.owner_uid ?? ''), name: String(data.owner_name ?? 'A friend') };
}

function membersOf(data: DocumentData): { uid: string; name: string; avatar: string | null }[] {
  const members = (data.members ?? {}) as Record<string, { name?: unknown; avatar?: unknown }>;
  return Object.entries(members).map(([uid, m]) => ({
    uid,
    name: typeof m?.name === 'string' && m.name.trim() ? m.name.trim() : 'Friend',
    avatar: typeof m?.avatar === 'string' && m.avatar ? m.avatar : null,
  }));
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
    if (!seen.has(syncId)) await forgetFollowedJourneyWithDocuments(syncId);
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
  const allPlans = await getAllAccommodationsForSync();
  if (allPlans.length === 0) return;

  const plans_ = accommodationsCollection(uid);
  const scope = await pushScope('accommodations', plans_, allPlans, (p) => p.id, (p) => p.updated_at);
  const plans = scope.rows;
  const cloud = scope.cloud;

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
      synced_at: serverTimestamp(),
      deleted: plan.deleted,
    });
    ops++;
    if (ops >= BATCH_LIMIT) await commit();
  }
  await commit();
  await scope.done();
  // The mirror gets every plan, not only the ones pushed just now.
  await mirrorAccommodations(allPlans.filter((p) => !p.deleted));
}

/** What the mirror last got per shared trip, so an unchanged set is not written again. */
const mirroredPlans = new Map<string, string>();

/** Drop what this module remembers about the previous account's trips. */
export function resetSyncState(): void {
  stopRealtimeSync();
  mirroredPlans.clear();
}

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
  const changed = await changedDocs('accommodations', accommodationsCollection(uid));
  for (const docSnap of changed.docs) {
    const plan = accommodationFromDoc(docSnap.id, docSnap.data());
    // A document without dates cannot be stored (NOT NULL); nothing writes
    // one, but a hand-edited document must not break the whole pull.
    if (!plan.deleted && (!plan.check_in || !plan.check_out || !plan.journey_id)) continue;
    await upsertAccommodationFromCloud(plan);
  }
  await changed.done();
}

// ─── Bidirectional Sync ───

/**
 * Trips, visas and journeys, both directions. Pull first so cloud data is
 * never overwritten by an empty or stale local database, which is exactly
 * the state right after a reinstall.
 */
export async function syncAll(uid: string): Promise<void> {
  // Each collection stands on its own: one that fails used to abort the
  // rest, so a single bad write meant journeys, documents and the profile
  // never went anywhere and the phone kept saying it had never synced.
  // Failures are still failures (the caller shows the error and the
  // last-synced stamp does not move), but the other collections get their
  // turn, and the report names the step that broke.
  const steps: [string, () => Promise<void>][] = [
    ['trips:pull', () => pullTripsFromCloud(uid)],
    ['trips:push', () => pushTripsToCloud(uid)],
    ['visas:pull', () => pullVisasFromCloud(uid)],
    ['visas:push', () => pushVisasToCloud(uid)],
    ['profile:pull', () => pullProfileFromCloud(uid)],
    ['journeys:pull', () => pullJourneysFromCloud(uid)],
    ['members:pull', () => pullMembersFromCloud(uid)],
    ['journeys:push', () => pushJourneysToCloud(uid)],
    ['shared:pull', () => pullSharedJourneysFromCloud(uid)],
    ['accommodations:pull', () => pullAccommodationsFromCloud(uid)],
    ['accommodations:push', () => pushAccommodationsToCloud(uid)],
    ['documents:pull', () => pullDocumentsFromCloud(uid)],
    ['documents:push', () => pushDocumentsToCloud(uid)],
    ['profile:push', () => pushProfileToCloud(uid)],
    ['tombstones:purge', async () => { await purgeSyncedTombstones(); }],
  ];

  let first: unknown = null;
  for (const [name, run] of steps) {
    try {
      await run();
    } catch (err) {
      if (first === null) first = err;
      reportError(err, `sync:${name}`);
    }
  }
  // Open screens re-read what the pulls wrote, even when a later step failed.
  cloudChanged();
  if (first !== null) throw first;

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

  let stopped = false;
  const later: Unsubscribe[] = [];
  // Every snapshot is applied to SQLite one after the other, in the order
  // they arrived, across all listeners. The callbacks are async and were
  // run side by side: an older version of a journey could finish after a
  // newer one and bring back a stop that had been deleted. Snapshots still
  // waiting when the listeners stop are dropped, so nothing of a previous
  // account lands after the local data was handed to the next one.
  let queue: Promise<void> = Promise.resolve();
  const inOrder = (name: string, apply: (snapshot: QuerySnapshot) => Promise<void>) => (snapshot: QuerySnapshot) => {
    queue = queue
      .then(() => (stopped ? undefined : apply(snapshot)))
      .catch((err) => reportError(err, `sync:${name}-realtime`));
  };
  // Trips, journeys and plans are listened to from the pull cursor on, not
  // from the beginning: the first snapshot of a whole-collection listener is
  // the whole collection, read and applied again right after the pull did
  // the same. The query needs the cursor from SQLite, so these start a
  // moment later than the others.
  const listenFrom = (
    name: SyncedCollection,
    coll: CollectionReference,
    onChange: (snapshot: QuerySnapshot) => Promise<void>,
  ) => {
    listenQuery(name, coll)
      .then((q) => {
        if (stopped) return;
        later.push(onSnapshot(q, inOrder(name, onChange), (err) => reportError(err, `sync:${name}-listen`)));
      })
      .catch((err) => reportError(err, `sync:${name}-listen`));
  };

  // Journeys: what an agent or another device writes shows up without a
  // restart. Documents of the same journey edited here in the meantime keep
  // winning through the updated_at comparison in the upsert.
  listenFrom('journeys', journeysCollection(uid), async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      if (change.type === 'added' || change.type === 'modified') {
        try {
          await upsertJourneyFromCloud(journeyFromDoc(change.doc.id, change.doc.data()));
        } catch (err) {
          reportError(err, 'sync:journeys-realtime');
        }
      }
    }
    if (snapshot.docChanges().length > 0) cloudChanged();
  });

  // Accommodation plans: the agent's research lands on the phone while the
  // trip is open, same as its stops.
  listenFrom('accommodations', accommodationsCollection(uid), async (snapshot) => {
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
    if (snapshot.docChanges().length > 0) cloudChanged();
  });

  // Trips followed: a friend's edit shows up here; a trip no longer shared
  // with us leaves the query and is tombstoned.
  const unsubscribeFollowed = onSnapshot(query(sharedJourneysCollection(), where('member_uids', 'array-contains', uid)), inOrder('followed', async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      try {
        if (change.type === 'removed') {
          await forgetFollowedJourneyWithDocuments(change.doc.id);
        } else {
          await takeFollowedJourney(change.doc.id, change.doc.data());
        }
      } catch (err) {
        reportError(err, 'sync:followed-realtime');
      }
    }
    if (snapshot.docChanges().length > 0) cloudChanged();
  }), (err) => reportError(err, 'sync:followed-listen'));

  // Trips shared: a friend joining becomes a traveller within seconds. A
  // mirror that disappeared means sharing was stopped, from here or through
  // account deletion.
  const unsubscribeShared = onSnapshot(query(sharedJourneysCollection(), where('owner_uid', '==', uid)), inOrder('shared', async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      try {
        if (change.type === 'removed') {
          await clearJourneyShareCodeBySyncId(change.doc.id);
        } else {
          await syncJourneyMembers(change.doc.id, membersOf(change.doc.data()), uid);
          const code = change.doc.get('invite_code');
          if (typeof code === 'string') await updateJourneyShareCodeBySyncId(change.doc.id, code);
        }
      } catch (err) {
        reportError(err, 'sync:shared-realtime');
      }
    }
    if (snapshot.docChanges().length > 0) cloudChanged();
  }), (err) => reportError(err, 'sync:shared-listen'));

  // Loaded once, on the first snapshot, and kept in step: that first
  // snapshot is the whole collection again, right after the pull read it.
  let tripStamps: Map<string, string | null> | null = null;
  listenFrom('trips', tripsCollection(uid), async (snapshot) => {
    if (!tripStamps) tripStamps = await getTripSyncStamps();
    for (const change of snapshot.docChanges()) {
      if (change.type === 'added' || change.type === 'modified') {
        const data = change.doc.data();
        const updatedAt = data.updated_at instanceof Timestamp
          ? data.updated_at.toDate().toISOString()
          : new Date().toISOString();
        if (!tripBringsNews(tripStamps, change.doc.id, updatedAt, data.deleted === true)) continue;

        // One broken document must not cost the rest of the snapshot.
        try {
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
            install_id: typeof data.install_id === 'string' ? data.install_id : null,
          });
          rememberTripStamp(tripStamps, change.doc.id, updatedAt, data.deleted === true);
        } catch (err) {
          reportError(err, 'sync:trips-realtime');
        }
      }
    }
    if (snapshot.docChanges().length > 0) cloudChanged();
  });

  // Documents of shared trips: one listener per trip, set up once the
  // trips are known. `notifyDocumentsChanged` wakes the open wallet.
  let unsubscribeDocuments: Unsubscribe | null = null;
  watchDocuments(uid, notifyDocumentsChanged).then((u) => {
    if (stopped) u();
    else unsubscribeDocuments = u;
  }).catch((err) => reportError(err, 'sync:documents-watch'));

  const unsubscribe: Unsubscribe = () => {
    stopped = true;
    later.forEach((u) => u());
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

// ─── Wipe travel data (trips), local + cloud. Plans are preserved. ───

/**
 * Clear every trip, here and on every device of the account.
 *
 * Trips become tombstones that the push carries to the cloud and the other
 * devices pull. Deleting the cloud documents instead left a second phone
 * holding the rows with nothing to tell it they were gone, so its next push
 * put all of them back.
 *
 * The pull comes first so a trip another device added in the meantime is
 * cleared too; without a connection nothing is cleared and the caller shows
 * the error. A push that fails later is not an error: the tombstones are
 * local and go out with the next sync.
 */
export async function clearAllTravelData(uid: string | null): Promise<void> {
  stopRealtimeSync();

  if (uid) await pullTripsFromCloud(uid);
  await markAllTripsDeleted();

  if (uid) {
    try {
      await pushTripsToCloud(uid);
    } catch (err) {
      reportError(err, 'sync:clear-travel-data');
    }
  }

  await clearBadgeProgress();
  cloudChanged();
}
