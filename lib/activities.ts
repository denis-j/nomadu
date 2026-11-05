import * as Crypto from 'expo-crypto';
import { getDatabase } from './database';
import { localIsNewer } from './syncTime';
import { localChanged } from './syncTrigger';
import {
  normalizeActivity,
  type Activity,
  type ActivityCategory,
  type ActivitySource,
  type ActivityStatus,
} from './activityModel';

/**
 * Things to do, on the phone.
 *
 * The rules live in `activityModel.ts`; this file reads activities out of
 * SQLite and writes them back. Every write bumps `updated_at`, which is
 * what the sync compares, one activity at a time (`lib/sync.ts`). On a
 * friend's trip we may plan, a write is kept as theirs (`followed`) and
 * marked `dirty`, so the push hands it to the owner, like accommodations.
 */

export interface LocalActivity extends Activity {
  local_id: number;
  /** Came with a friend's trip: read here, owned there. */
  followed: boolean;
}

interface ActivityRow {
  id: number;
  sync_id: string;
  journey_sync_id: string;
  stop_sync_id: string | null;
  title: string;
  category: ActivityCategory;
  status: ActivityStatus;
  place: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  url: string | null;
  price: number | null;
  currency: string | null;
  notes: string | null;
  source: ActivitySource;
  source_url: string | null;
  image_url: string | null;
  sort_order: number;
  updated_at: string;
  deleted: number;
  followed: number;
  dirty: number;
}

function fromRow(row: ActivityRow): LocalActivity {
  return {
    local_id: row.id,
    id: row.sync_id,
    journey_id: row.journey_sync_id,
    stop_id: row.stop_sync_id,
    title: row.title,
    category: row.category,
    status: row.status,
    place: row.place,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    url: row.url,
    price: row.price,
    currency: row.currency,
    notes: row.notes,
    source: row.source,
    source_url: row.source_url,
    image_url: row.image_url,
    sort_order: row.sort_order,
    updated_at: row.updated_at,
    deleted: row.deleted === 1,
    followed: row.followed === 1,
  };
}

const nowIso = () => new Date().toISOString();

export async function getActivitiesForJourney(journeySyncId: string): Promise<LocalActivity[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ActivityRow>(
    'SELECT * FROM activities WHERE journey_sync_id = ? AND deleted = 0 ORDER BY sort_order ASC, id ASC',
    [journeySyncId],
  );
  return rows.map(fromRow);
}

export async function getActivity(syncId: string): Promise<LocalActivity | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ActivityRow>('SELECT * FROM activities WHERE sync_id = ?', [syncId]);
  return row ? fromRow(row) : null;
}

/** One activity into its row, inserted or replaced whole. */
async function writeRow(a: Activity, updatedAt: string, followed: boolean, dirty: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO activities
       (sync_id, journey_sync_id, stop_sync_id, title, category, status, place, address, latitude, longitude,
        url, price, currency, notes, source, source_url, image_url, sort_order, updated_at, deleted, followed, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(sync_id) DO UPDATE SET
       journey_sync_id = excluded.journey_sync_id, stop_sync_id = excluded.stop_sync_id, title = excluded.title,
       category = excluded.category, status = excluded.status, place = excluded.place, address = excluded.address,
       latitude = excluded.latitude, longitude = excluded.longitude, url = excluded.url, price = excluded.price,
       currency = excluded.currency, notes = excluded.notes, source = excluded.source, source_url = excluded.source_url,
       image_url = excluded.image_url, sort_order = excluded.sort_order, updated_at = excluded.updated_at,
       deleted = excluded.deleted, followed = excluded.followed, dirty = excluded.dirty`,
    [
      a.id, a.journey_id, a.stop_id, a.title, a.category, a.status, a.place, a.address, a.latitude, a.longitude,
      a.url, a.price, a.currency, a.notes, a.source, a.source_url, a.image_url, a.sort_order, updatedAt,
      a.deleted ? 1 : 0, followed ? 1 : 0, dirty ? 1 : 0,
    ],
  );
}

async function isFollowedTrip(journeySyncId: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM journeys WHERE sync_id = ? AND shared_owner_uid IS NOT NULL', [journeySyncId]);
  return !!row;
}

/** A write from this phone (never from a pull): the sync should push soon. */
async function writeLocal(a: Activity): Promise<LocalActivity> {
  const followed = await isFollowedTrip(a.journey_id);
  await writeRow(a, nowIso(), followed, followed);
  localChanged();
  return (await getActivity(a.id))!;
}

async function nextSortOrder(journeySyncId: string, stopSyncId: string | null): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ max: number | null }>(
    'SELECT MAX(sort_order) AS max FROM activities WHERE journey_sync_id = ? AND stop_sync_id IS ? AND deleted = 0',
    [journeySyncId, stopSyncId],
  );
  return (row?.max ?? -1) + 1;
}

/** A new activity on a stop (or not placed yet, `stopSyncId` null). Throws the model's error on bad input. */
export async function addActivity(journeySyncId: string, stopSyncId: string | null, input: unknown): Promise<LocalActivity> {
  const fields = normalizeActivity(input);
  return writeLocal({
    ...fields,
    id: Crypto.randomUUID(),
    journey_id: journeySyncId,
    stop_id: stopSyncId,
    sort_order: await nextSortOrder(journeySyncId, stopSyncId),
    updated_at: nowIso(),
    deleted: false,
  });
}

export async function updateActivity(syncId: string, input: unknown): Promise<LocalActivity> {
  const current = await getActivity(syncId);
  if (!current) throw new Error('That activity is gone.');
  return writeLocal({ ...current, ...normalizeActivity(input, current) });
}

export async function setActivityStatus(syncId: string, status: ActivityStatus): Promise<LocalActivity> {
  return updateActivity(syncId, { status });
}

/** Onto another stop of the same trip, or back to not placed (null). Goes to the end there. */
export async function moveActivity(syncId: string, stopSyncId: string | null): Promise<LocalActivity> {
  const current = await getActivity(syncId);
  if (!current) throw new Error('That activity is gone.');
  if (current.stop_id === stopSyncId) return current;
  return writeLocal({ ...current, stop_id: stopSyncId, sort_order: await nextSortOrder(current.journey_id, stopSyncId) });
}

/** Tombstone: gone here and, through the sync, for the agent and the friends. */
export async function deleteActivity(syncId: string): Promise<void> {
  const current = await getActivity(syncId);
  if (!current) return;
  await writeLocal({ ...current, deleted: true });
}

// ─── Sync ────────────────────────────────────────────────────────────────────
// One cloud document per activity, compared by updated_at.

export interface ActivityForSync extends Activity {
  local_id: number;
}

/** This account's own activities, tombstones included; a friend's are not ours to push. */
export async function getAllActivitiesForSync(): Promise<ActivityForSync[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ActivityRow>('SELECT * FROM activities WHERE followed = 0 ORDER BY id ASC');
  return rows.map(fromRow);
}

/** A cloud activity into the local database. Newer side wins; a tombstone tombstones. */
export async function upsertActivityFromCloud(remote: Activity): Promise<void> {
  const existing = await getActivity(remote.id);
  if (existing && localIsNewer(existing.updated_at, remote.updated_at)) return;
  if (!existing && remote.deleted) return;
  await writeRow(remote, remote.updated_at, false, false);
}

/**
 * The activities that came with a friend's trip, as the mirror has them
 * now. One the owner removed is no longer in the list and is tombstoned
 * here. Where the owner lets us plan (`keepEdits`), one changed here that
 * has not reached them yet waits for the push instead.
 */
export async function replaceFollowedActivities(journeySyncId: string, list: Activity[], keepEdits = false): Promise<void> {
  const db = await getDatabase();
  const keep = new Set(list.map((a) => a.id));
  const dirty = new Set(
    keepEdits
      ? (await db.getAllAsync<{ sync_id: string }>('SELECT sync_id FROM activities WHERE journey_sync_id = ? AND followed = 1 AND dirty = 1', [journeySyncId])).map((r) => r.sync_id)
      : [],
  );
  if (!keepEdits) await db.runAsync('UPDATE activities SET dirty = 0 WHERE journey_sync_id = ? AND followed = 1', [journeySyncId]);
  const local = await db.getAllAsync<{ sync_id: string }>('SELECT sync_id FROM activities WHERE journey_sync_id = ? AND followed = 1 AND deleted = 0', [journeySyncId]);
  for (const row of local) {
    if (!keep.has(row.sync_id) && !dirty.has(row.sync_id)) {
      await db.runAsync('UPDATE activities SET deleted = 1, updated_at = ? WHERE sync_id = ?', [nowIso(), row.sync_id]);
    }
  }
  for (const a of list) {
    if (!dirty.has(a.id)) await writeRow(a, a.updated_at, true, false);
  }
}

/** Activities of a friend's trip changed here and not yet with the owner, tombstones included. */
export async function getDirtyFollowedActivities(journeySyncId: string): Promise<ActivityForSync[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ActivityRow>('SELECT * FROM activities WHERE journey_sync_id = ? AND followed = 1 AND dirty = 1', [journeySyncId]);
  return rows.map(fromRow);
}

/** The edit reached the owner (or was refused as stale). Only if unchanged here since. */
export async function clearActivityDirty(syncId: string, updatedAt: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE activities SET dirty = 0 WHERE sync_id = ? AND updated_at = ?', [syncId, updatedAt]);
}
