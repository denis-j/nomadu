/**
 * Things to do on a trip, over the agent API.
 *
 * One document per activity at `users/{uid}/activities/{activityId}`,
 * tagged with its journey and stop, so an agent filling a city with ideas
 * never writes over what the user or a friend added next to them. An
 * activity whose stop is gone (or that never had one) is "not placed yet"
 * in the app; nothing here moves activities when stops change.
 *
 * Every write runs through `normalizeActivity` in `lib/activityModel.ts`,
 * which the app's forms use too. Planning only: nothing in this file
 * touches the timeline (`trips`), visas or tax.
 */

import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';

import { AccommodationValidationError } from '../../lib/accommodationModel';
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_SOURCES,
  ACTIVITY_STATUSES,
  MAX_ACTIVITIES_PER_JOURNEY,
  normalizeActivity,
  type Activity,
  type ActivityFields,
} from '../../lib/activityModel';
import { ApiError, send, type Caller } from './api';

// ─── Storage ─────────────────────────────────────────────────────────────────

function activitiesCol(uid: string) {
  return getFirestore().collection(`users/${uid}/activities`);
}

function choice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && (choices as readonly string[]).includes(value) ? (value as T) : fallback;
}

const textOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * A stored activity as the API shows it. Lenient on purpose: the phone
 * writes these documents too, and a field an older build left out should
 * read as empty, not fail the whole list.
 */
export function activityFromDoc(id: string, x: FirebaseFirestore.DocumentData): Activity {
  return {
    id,
    journey_id: String(x.journey_id ?? ''),
    stop_id: typeof x.stop_id === 'string' && x.stop_id ? x.stop_id : null,
    title: String(x.title ?? ''),
    category: choice(x.category, ACTIVITY_CATEGORIES, 'other'),
    status: choice(x.status, ACTIVITY_STATUSES, 'idea'),
    place: textOrNull(x.place),
    address: textOrNull(x.address),
    latitude: numOrNull(x.latitude),
    longitude: numOrNull(x.longitude),
    url: textOrNull(x.url),
    price: numOrNull(x.price),
    currency: textOrNull(x.currency),
    notes: textOrNull(x.notes),
    source: choice(x.source, ACTIVITY_SOURCES, 'manual'),
    source_url: textOrNull(x.source_url),
    image_url: textOrNull(x.image_url),
    sort_order: numOrNull(x.sort_order) ?? 0,
    updated_at: x.updated_at instanceof Timestamp ? x.updated_at.toDate().toISOString() : '',
    deleted: x.deleted === true,
  };
}

function fieldsOf(a: Activity): ActivityFields {
  const { id: _i, journey_id: _j, stop_id: _s, sort_order: _o, updated_at: _u, deleted: _d, ...fields } = a;
  return fields;
}

/** The public shape: everything but the tombstone flag, which a live activity never has set. */
function publicActivity(a: Activity) {
  const { deleted: _d, ...rest } = a;
  return { ...rest, updated_at: a.updated_at || null };
}

async function store(uid: string, id: string, journeyId: string, stopId: string | null, fields: ActivityFields, sortOrder: number): Promise<Activity> {
  const ref = activitiesCol(uid).doc(id);
  await ref.set({
    journey_id: journeyId,
    stop_id: stopId,
    ...fields,
    sort_order: sortOrder,
    updated_at: Timestamp.now(),
    synced_at: FieldValue.serverTimestamp(),
    deleted: false,
  });
  return activityFromDoc(id, (await ref.get()).data()!);
}

// ─── The journey they hang off ───────────────────────────────────────────────

/** The stop ids of a live journey, in order; 404 when there is no such journey. */
async function loadStopIds(uid: string, journeyId: string): Promise<string[]> {
  const snap = await getFirestore().collection(`users/${uid}/journeys`).doc(journeyId).get();
  if (!snap.exists || snap.get('deleted') === true) throw new ApiError(404, 'not-found', 'No such journey.');
  const legs = Array.isArray(snap.get('legs')) ? (snap.get('legs') as any[]) : [];
  return legs.map((l) => String(l?.sync_id ?? '')).filter(Boolean);
}

async function liveActivities(uid: string, journeyId: string): Promise<Activity[]> {
  const snap = await activitiesCol(uid).where('journey_id', '==', journeyId).get();
  return snap.docs.filter((d) => d.get('deleted') !== true).map((d) => activityFromDoc(d.id, d.data()));
}

/** Next place at the end of a stop's list (or of the unplaced ones). */
function nextSortOrder(live: Activity[], stopId: string | null, except?: string): number {
  const orders = live.filter((a) => a.stop_id === stopId && a.id !== except).map((a) => a.sort_order);
  return orders.length ? Math.max(...orders) + 1 : 0;
}

/** A stop_id from a body: absent keeps `fallback`, null unplaces, anything else must be a stop of the journey. */
function pickStop(value: unknown, fallback: string | null, stopIds: string[]): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== 'string' || !stopIds.includes(value)) {
    throw new ApiError(400, 'invalid-argument', 'stop_id must be the id of a stop of this journey, or null.');
  }
  return value;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

function asApiError(err: unknown): unknown {
  if (err instanceof AccommodationValidationError) return new ApiError(400, 'invalid-argument', err.message);
  return err;
}


/**
 * A journey that is gone takes its activities with it, tombstoned so the
 * phones learn about it on their next pull (and the mirror drops them).
 */
export async function tombstoneActivitiesForJourney(uid: string, journeyId: string): Promise<void> {
  const snap = await getFirestore().collection(`users/${uid}/activities`).where('journey_id', '==', journeyId).get();
  for (const d of snap.docs) {
    if (d.get('deleted') === true) continue;
    await d.ref.update({ deleted: true, updated_at: Timestamp.now(), synced_at: FieldValue.serverTimestamp() });
  }
}

/**
 * Everything under /journeys/{id}/activities, and the create under
 * /journeys/{id}/stops/{stopId}/activities (`stopId` set, `rest` empty).
 * `rest` is what follows `activities`: nothing or `{activityId}`.
 *
 * Any token may write here, like journeys and accommodation: planning, not
 * the tracked past.
 */
export async function handleActivityRoute(
  caller: Caller,
  req: Request,
  res: Response,
  journeyId: string,
  stopId: string | null,
  rest: string[],
): Promise<void> {
  try {
    await route(caller, req, res, journeyId, stopId, rest);
  } catch (err) {
    throw asApiError(err);
  }
}

async function route(caller: Caller, req: Request, res: Response, journeyId: string, pathStop: string | null, rest: string[]): Promise<void> {
  const { uid } = caller;
  const stopIds = await loadStopIds(uid, journeyId);
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};

  if (pathStop !== null) {
    if (!stopIds.includes(pathStop)) throw new ApiError(404, 'not-found', 'No such stop in this journey.');
    if (rest.length === 0 && req.method === 'POST') {
      await create(uid, res, journeyId, pathStop, body);
      return;
    }
    throw new ApiError(404, 'not-found', 'Unknown route.');
  }

  if (rest.length === 0) {
    if (req.method === 'GET') {
      const filter = typeof req.query.stop === 'string' && req.query.stop ? req.query.stop : null;
      const order = new Map(stopIds.map((id, i) => [id, i]));
      // In trip order: stop by stop, the unplaced ones (and those whose stop
      // is gone) last, then by their own order.
      const rank = (a: Activity) => (a.stop_id !== null && order.has(a.stop_id) ? order.get(a.stop_id)! : stopIds.length);
      const list = (await liveActivities(uid, journeyId))
        .filter((a) => !filter || a.stop_id === filter)
        .sort((a, b) => rank(a) - rank(b) || a.sort_order - b.sort_order || a.title.localeCompare(b.title))
        .map(publicActivity);
      send(res, 200, { activities: list });
      return;
    }
    if (req.method === 'POST') {
      await create(uid, res, journeyId, pickStop(body.stop_id, null, stopIds), body);
      return;
    }
  }

  if (rest.length === 1 && rest[0]) {
    const id = rest[0];
    const ref = activitiesCol(uid).doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.get('deleted') === true || snap.get('journey_id') !== journeyId) {
      throw new ApiError(404, 'not-found', 'No such activity in this journey.');
    }
    const current = activityFromDoc(id, snap.data()!);
    if (req.method === 'GET') {
      send(res, 200, publicActivity(current));
      return;
    }
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const fields = normalizeActivity(body, fieldsOf(current));
      const stopId = pickStop(body.stop_id, current.stop_id, stopIds);
      let sortOrder = current.sort_order;
      if (typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)) sortOrder = body.sort_order;
      else if (stopId !== current.stop_id) sortOrder = nextSortOrder(await liveActivities(uid, journeyId), stopId, id);
      send(res, 200, publicActivity(await store(uid, id, journeyId, stopId, fields, sortOrder)));
      return;
    }
    if (req.method === 'DELETE') {
      await ref.update({ deleted: true, updated_at: Timestamp.now(), synced_at: FieldValue.serverTimestamp() });
      send(res, 200, { ok: true });
      return;
    }
  }

  throw new ApiError(404, 'not-found', 'Unknown route.');
}

async function create(uid: string, res: Response, journeyId: string, stopId: string | null, body: Record<string, unknown>): Promise<void> {
  // Saved by an agent unless it says where the idea came from (a link it
  // was handed, say).
  const fields = normalizeActivity({ source: 'agent', ...body });
  const live = await liveActivities(uid, journeyId);
  if (live.length >= MAX_ACTIVITIES_PER_JOURNEY) {
    throw new ApiError(400, 'invalid-argument', `A journey can hold at most ${MAX_ACTIVITIES_PER_JOURNEY} activities. Delete some first.`);
  }
  const sortOrder = typeof body.sort_order === 'number' && Number.isFinite(body.sort_order) ? body.sort_order : nextSortOrder(live, stopId);
  send(res, 201, publicActivity(await store(uid, randomUUID(), journeyId, stopId, fields, sortOrder)));
}
