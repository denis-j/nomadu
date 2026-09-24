/**
 * Agent access: the app's data for a tool-using AI, over plain HTTPS.
 *
 * A personal token, created in the app's settings, stands in for the signed-in
 * user. Only its hash is stored (`agent_tokens/{sha256}`), so a leaked
 * database yields nothing usable, and revoking is deleting that document.
 * Everything the API returns is the user's own synced data from Firestore;
 * documents (boarding passes and the like) never leave the phone and are not
 * reachable here.
 *
 * The arithmetic for visas, tax and stats is the app's own code, bundled into
 * this function, so the agent gets the same numbers the Tracking screen shows.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest, type Request } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { requireAppAccess, requirePro, revenueCatKey } from './access';
import type { Response } from 'express';

import { calculateAllVisaStatuses } from '../../lib/visaCalculations';
import { calculateAllTaxStatuses } from '../../lib/taxCalculations';
import { statsFromTrips } from '../../lib/stats';
import { availableYearsFromTrips } from '../../lib/yearFilter';
import { chainDates, countDays, fromYmd, toYmd } from '../../lib/days';
import type { Trip } from '../../lib/database';
import type { UserVisa } from '../../lib/userVisas';
import { findCityCoords, getCountryCode, getCountryName } from '../../utils/geography';
import {
  accommodationSummaries,
  handleAccommodationRoute,
  listAccommodations,
  tombstonePlansForJourney,
  tombstonePlansForStops,
  type AccommodationSummary,
} from './accommodation';
import { ApiError, send, type Caller } from './api';
import { TRANSPORTS, docsHtml, openapi } from './openapi';

const REGION = 'us-central1';
const TOKENS = 'agent_tokens';
const TOKEN_PREFIX = 'nmd_';
const MAX_TOKENS_PER_USER = 5;
const MAX_STOPS = 60;
const TRANSPORT_SET = new Set<string>(TRANSPORTS);

// ─── Tokens (callable, from the app) ──────────────────────────────────────────

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function requireUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return uid;
}

export const createAgentToken = onCall({ region: REGION, secrets: [revenueCatKey] }, async (request) => {
  const uid = requireUid(request.auth?.uid);
  // An agent key is a Pro feature, and it outlives the app session.
  await requireAppAccess(request, uid, 'createAgentToken');
  const label = typeof request.data?.label === 'string' ? request.data.label.trim().slice(0, 40) : '';
  // Chosen when the token is made and fixed for its life: whether the agent
  // may write to the tracked timeline, or only read it.
  const editTimeline = request.data?.editTimeline === true;
  const db = getFirestore();

  const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
  const id = hashToken(token);
  // Count and create together: parallel calls each saw room for one more.
  await db.runTransaction(async (tx) => {
    const existing = (await tx.get(db.collection(TOKENS).where('uid', '==', uid))) as FirebaseFirestore.QuerySnapshot;
    if (existing.size >= MAX_TOKENS_PER_USER) {
      throw new HttpsError('resource-exhausted', `You can have at most ${MAX_TOKENS_PER_USER} tokens. Revoke one first.`);
    }
    tx.set(db.collection(TOKENS).doc(id), {
      uid,
      label: label || 'Agent',
      // Enough to recognise a token in a config file, useless for guessing it.
      prefix: token.slice(0, TOKEN_PREFIX.length + 6),
      edit_timeline: editTimeline,
      created_at: FieldValue.serverTimestamp(),
      last_used_at: null,
    });
  });
  logger.info('agent token created', { uid, id: id.slice(0, 8), editTimeline });
  // The only time the token itself leaves the server.
  return { id, token, label: label || 'Agent', edit_timeline: editTimeline };
});

export const revokeAgentToken = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const id = typeof request.data?.id === 'string' ? request.data.id : '';
  if (!/^[a-f0-9]{64}$/.test(id)) throw new HttpsError('invalid-argument', 'Unknown token.');
  const db = getFirestore();
  const ref = db.collection(TOKENS).doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.get('uid') !== uid) throw new HttpsError('not-found', 'Unknown token.');
  await ref.delete();
  return { ok: true };
});

export const listAgentTokens = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const snap = await getFirestore().collection(TOKENS).where('uid', '==', uid).get();
  const stamp = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : null);
  return {
    tokens: snap.docs
      .map((d) => ({
        id: d.id,
        label: d.get('label') ?? 'Agent',
        prefix: d.get('prefix') ?? '',
        edit_timeline: d.get('edit_timeline') === true,
        created_at: stamp(d.get('created_at')),
        last_used_at: stamp(d.get('last_used_at')),
      }))
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')),
  };
});

// ─── The API (bearer token, from the agent) ───────────────────────────────────

/** Requests per token and minute. An agent working through a trip needs a few dozen. */
export const AGENT_REQUESTS_PER_MINUTE = 60;

/**
 * Every request reads whole collections, so a leaked or looping token could
 * run up Firestore reads without end. Counted per token and minute in
 * `agent_usage` (closed to clients by the catch-all rule).
 */
async function consumeTokenBudget(tokenId: string): Promise<void> {
  const db = getFirestore();
  const minute = new Date().toISOString().slice(0, 16);
  const ref = db.collection('agent_usage').doc(`${tokenId.slice(0, 32)}_${minute}`);
  const used = await db.runTransaction(async (tx) => {
    const count = Number(((await tx.get(ref)) as FirebaseFirestore.DocumentSnapshot).get('count') ?? 0);
    if (count < AGENT_REQUESTS_PER_MINUTE) {
      // expires_at: set a Firestore TTL policy on this field to drop old counters.
      tx.set(ref, { count: FieldValue.increment(1), expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) }, { merge: true });
    }
    return count;
  });
  if (used >= AGENT_REQUESTS_PER_MINUTE) {
    throw new ApiError(429, 'rate-limited', `At most ${AGENT_REQUESTS_PER_MINUTE} requests per minute. Wait a moment and try again.`);
  }
}

async function authenticate(req: Request): Promise<Caller> {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match || !match[1].startsWith(TOKEN_PREFIX)) {
    throw new ApiError(401, 'unauthenticated', 'Send the token as "Authorization: Bearer nmd_…".');
  }
  const ref = getFirestore().collection(TOKENS).doc(hashToken(match[1]));
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(401, 'unauthenticated', 'Unknown or revoked token.');
  await consumeTokenBudget(ref.id);
  ref.update({ last_used_at: FieldValue.serverTimestamp() }).catch(() => {});
  const uid = snap.get('uid') as string;
  // Keys outlive the subscription they were made under: checked on use, not
  // only on creation. Cached, so this is one document read per request.
  try {
    await requirePro(uid, 'agentApi');
  } catch {
    throw new ApiError(403, 'forbidden', 'This key belongs to an account without Nomadu Pro.');
  }
  return { uid, editTimeline: snap.get('edit_timeline') === true };
}

function requireTimelineWrite(caller: Caller): void {
  if (!caller.editTimeline) {
    throw new ApiError(403, 'forbidden', 'This key can only read the timeline. Ask the user for a key that may edit it.');
  }
}

// ── Data ──

async function loadTrips(uid: string): Promise<Trip[]> {
  const snap = await getFirestore().collection(`users/${uid}/trips`).get();
  const trips: Trip[] = [];
  for (const d of snap.docs) {
    const x = d.data();
    if (x.deleted === true) continue;
    trips.push({
      id: 0,
      city: String(x.city ?? ''),
      country: String(x.country ?? ''),
      country_code: String(x.country_code ?? '').toUpperCase(),
      latitude: x.latitude ?? null,
      longitude: x.longitude ?? null,
      start_date: String(x.start_date),
      end_date: x.end_date ?? null,
      days: Number(x.days ?? 1),
      sync_id: d.id,
      updated_at: null,
      deleted: 0,
    });
  }
  trips.sort((a, b) => a.start_date.localeCompare(b.start_date));
  return trips;
}

async function loadVisas(uid: string): Promise<UserVisa[]> {
  const snap = await getFirestore().collection(`users/${uid}/visas`).get();
  return snap.docs
    .filter((d) => d.get('deleted') !== true)
    .map((d, i) => {
      const x = d.data();
      return {
        id: i + 1,
        country_code: String(x.country_code),
        label: String(x.label ?? ''),
        valid_from: String(x.valid_from),
        valid_to: String(x.valid_to),
        max_days_per_stay: x.max_days_per_stay ?? null,
        max_days_per_window: x.max_days_per_window ?? null,
        window_days: x.window_days ?? null,
        entries_allowed: x.entries_allowed ?? 'multiple',
        notes: x.notes ?? null,
        created_at: '',
        updated_at: null,
        sync_id: d.id,
        deleted: 0,
      };
    });
}

async function loadProfile(uid: string) {
  const snap = await getFirestore().doc(`users/${uid}`).get();
  const x = snap.data() ?? {};
  const citizenship = x.citizenship && typeof x.citizenship.countryCode === 'string'
    ? { country: String(x.citizenship.country), countryCode: String(x.citizenship.countryCode).toUpperCase() }
    : null;
  return {
    citizenship,
    hasFixedResidence: typeof x.hasFixedResidence === 'boolean' ? x.hasFixedResidence : null,
    timezone: typeof x.timezone === 'string' ? x.timezone : null,
  };
}

/**
 * The user's today, as a local date on this server. The day counts all work
 * on calendar days, and the server runs in UTC: for someone in Bangkok before
 * 07:00, "today" was yesterday, so an ongoing stay was a day short and a stay
 * starting today counted as the future. Falls back to UTC for profiles that
 * have not sent a timezone yet.
 */
export function userToday(timezone: string | null, now: Date = new Date()): Date {
  try {
    if (timezone) {
      const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
      const [y, m, d] = ymd.split('-').map(Number);
      if (y && m && d) return new Date(y, m - 1, d);
    }
  } catch {
    // Unknown zone name: fall through.
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function journeysCol(uid: string) {
  return getFirestore().collection(`users/${uid}/journeys`);
}

/**
 * A journey as the agent sees it. Every stop carries a summary of its
 * accommodation plan (or null), so one GET /journeys tells the agent which
 * stops still need a place without a request per stop.
 */
function publicJourney(id: string, x: FirebaseFirestore.DocumentData, accommodations: Map<string, AccommodationSummary>) {
  const legs = (Array.isArray(x.legs) ? x.legs : []) as any[];
  return {
    id,
    title: x.title,
    updated_at: x.updated_at instanceof Timestamp ? x.updated_at.toDate().toISOString() : null,
    start_date: legs[0]?.start_date ?? null,
    end_date: legs.length ? legs[legs.length - 1].end_date : null,
    stops: legs.map((l) => ({
      id: l.sync_id,
      city: l.city,
      country: l.country,
      country_code: l.country_code,
      start_date: l.start_date,
      end_date: l.end_date,
      transport: l.transport,
      notes: l.notes ?? null,
      accommodation: accommodations.get(l.sync_id) ?? null,
    })),
    travellers: (Array.isArray(x.travellers) ? x.travellers : []).map((t: any) => t.name),
  };
}

/**
 * The country an agent named, as the dataset knows it. A name it does not
 * know is an error, not "XX": a stay in Atlantis would count for nothing
 * and show a blank flag.
 */
function resolveCountry(raw: { country?: string; country_code?: string }, fallbackCode = '', where = ''): { code: string; country: string } {
  const code = (typeof raw.country_code === 'string' && raw.country_code.length === 2
    ? raw.country_code
    : typeof raw.country === 'string' && raw.country.trim() ? getCountryCode(raw.country) : fallbackCode).toUpperCase();
  const country = code.length === 2 ? getCountryName(code) : undefined;
  if (!country) throw new ApiError(400, 'invalid-argument', `${where}country or country_code is required and must be a real country.`);
  return { code, country };
}

// ── Stops as an agent describes them ──

interface StopInput {
  city: string;
  country: string;
  country_code?: string;
  start_date?: string;
  end_date?: string;
  days?: number;
  transport?: string;
  notes?: string;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turn the agent's stops into chained legs. Each stop needs either dates or
 * a length in days; the first one's start is the trip's start (today when
 * omitted). Dates always chain, the way the app's own stops do.
 */
function buildLegs(input: unknown, existing: any[] = []) {
  if (!Array.isArray(input) || input.length === 0) throw new ApiError(400, 'invalid-argument', '"stops" must be a non-empty array.');
  if (input.length > MAX_STOPS) throw new ApiError(400, 'invalid-argument', `At most ${MAX_STOPS} stops.`);

  let cursor = '';
  // Each existing stop can lend its id to one new stop only: two stops in
  // the same city used to both get the first one's id, which the phone's
  // unique index then dropped.
  const unmatched = [...existing];
  const draft = input.map((raw: StopInput, i) => {
    if (!raw || typeof raw.city !== 'string' || !raw.city.trim()) throw new ApiError(400, 'invalid-argument', `stops[${i}].city is required.`);
    const city = raw.city.trim().slice(0, 80);
    const { code, country } = resolveCountry(raw, '', `stops[${i}]: `);
    const transport = typeof raw.transport === 'string' && TRANSPORT_SET.has(raw.transport) ? raw.transport : 'flight';
    const notes = typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 500) || null : null;

    let start = typeof raw.start_date === 'string' && YMD.test(raw.start_date) ? raw.start_date : '';
    let end = typeof raw.end_date === 'string' && YMD.test(raw.end_date) ? raw.end_date : '';
    const days = typeof raw.days === 'number' && raw.days >= 1 ? Math.min(365, Math.floor(raw.days)) : null;
    if (!start) start = cursor || toYmd(new Date());
    if (!end) {
      if (!days) throw new ApiError(400, 'invalid-argument', `stops[${i}]: give end_date or days.`);
      const d = new Date(`${start}T12:00:00`);
      d.setDate(d.getDate() + days - 1);
      end = toYmd(d);
    }
    if (end < start) throw new ApiError(400, 'invalid-argument', `stops[${i}]: end_date is before start_date.`);
    const next = new Date(`${end}T12:00:00`);
    next.setDate(next.getDate() + 1);
    cursor = toYmd(next);

    // Keep the id of a stop the agent is editing in place, so the phone
    // updates it rather than replacing it, and so its accommodation plan
    // (keyed by that id) stays attached. Matched by the name as given or
    // as the dataset spells it, so an alias the dataset knows still finds
    // the stop it was added under.
    const coords = findCityCoords(city, code);
    const priorIndex = unmatched.findIndex((l) => l.country_code === code && (l.city === city || (coords && l.city === coords.name)));
    const prior = priorIndex >= 0 ? unmatched.splice(priorIndex, 1)[0] : undefined;
    return {
      sync_id: prior?.sync_id ?? randomUUID(),
      city: coords?.name ?? city,
      country,
      country_code: code,
      latitude: prior?.latitude ?? coords?.latitude ?? null,
      longitude: prior?.longitude ?? coords?.longitude ?? null,
      start_date: start,
      end_date: end,
      transport,
      notes,
      sort_order: i,
    };
  });

  const dates = chainDates(draft, draft[0].start_date);
  return draft.map((l, i) => ({ ...l, ...dates[i] }));
}

// ── Stays as an agent describes them ──

interface StayInput {
  city?: string;
  country?: string;
  country_code?: string;
  start_date?: string;
  end_date?: string;
}

function tripsCol(uid: string) {
  return getFirestore().collection(`users/${uid}/trips`);
}

function publicTrip(id: string, x: FirebaseFirestore.DocumentData) {
  return {
    id,
    city: x.city, country: x.country, country_code: x.country_code,
    start_date: x.start_date, end_date: x.end_date ?? null, days: Number(x.days ?? 1),
  };
}

/**
 * One tracked stay from the agent's words, or the fields it wants to change
 * on an existing one. Unlike planned stops these do not chain: every stay is
 * its own thing with its own two dates, and both are required on a new one
 * so an agent cannot open a stay that the tracker then has to close.
 */
function buildStay(raw: StayInput, existing: FirebaseFirestore.DocumentData | null) {
  if (!raw || typeof raw !== 'object') throw new ApiError(400, 'invalid-argument', 'Send a JSON body.');
  const out: Record<string, unknown> = {};

  const wantsPlace = raw.city !== undefined || raw.country !== undefined || raw.country_code !== undefined;
  if (wantsPlace || !existing) {
    const city = typeof raw.city === 'string' ? raw.city.trim().slice(0, 80) : String(existing?.city ?? '');
    if (!city) throw new ApiError(400, 'invalid-argument', '"city" is required.');
    const { code, country } = resolveCountry(raw, String(existing?.country_code ?? ''));
    const coords = findCityCoords(city, code);
    out.city = coords?.name ?? city;
    out.country = country;
    out.country_code = code;
    out.latitude = coords?.latitude ?? null;
    out.longitude = coords?.longitude ?? null;
  }

  const start = typeof raw.start_date === 'string' ? raw.start_date : String(existing?.start_date ?? '');
  const end = typeof raw.end_date === 'string' ? raw.end_date : (existing?.end_date ?? '');
  if (!YMD.test(start)) throw new ApiError(400, 'invalid-argument', '"start_date" must be YYYY-MM-DD.');
  if (!YMD.test(end)) throw new ApiError(400, 'invalid-argument', '"end_date" must be YYYY-MM-DD.');
  if (end < start) throw new ApiError(400, 'invalid-argument', '"end_date" is before "start_date".');
  // Against the latest "today" anywhere (UTC+14): the server runs in UTC,
  // and a stay that begins today in Bangkok is already tomorrow's date there
  // for part of the day.
  const latestToday = toYmd(new Date(Date.now() + 14 * 60 * 60 * 1000));
  if (start > latestToday) throw new ApiError(400, 'invalid-argument', 'A stay cannot start in the future. Plan it as a journey instead.');
  out.start_date = start;
  out.end_date = end;
  out.days = countDays(fromYmd(start), fromYmd(end));
  return out;
}

// ── Routing ──

function query(req: Request, name: string): string | null {
  const v = req.query[name];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

async function handle(req: Request, res: Response): Promise<void> {
  const path = req.path.replace(/\/+$/, '') || '/';
  if (req.method === 'GET' && path === '/v1/openapi.json') {
    send(res, 200, openapi());
    return;
  }
  if (req.method === 'GET' && path === '/v1/docs') {
    res.status(200).set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', 'public, max-age=300').send(docsHtml());
    return;
  }

  const caller = await authenticate(req);
  const { uid } = caller;
  const [, v1, resource, id, ...deeper] = path.split('/');
  if (v1 !== 'v1') throw new ApiError(404, 'not-found', 'Unknown route.');

  // Accommodation plans hang off a stop: /journeys/{id}/stops/{stopId}/accommodation…
  if (resource === 'journeys' && id && deeper[0] === 'stops' && deeper[1] && deeper[2] === 'accommodation') {
    await handleAccommodationRoute(caller, req, res, id, deeper[1], deeper.slice(3));
    return;
  }
  if (req.method === 'GET' && resource === 'accommodations' && !id) {
    await listAccommodations(caller, req, res);
    return;
  }
  if (deeper.length > 0) throw new ApiError(404, 'not-found', 'Unknown route.');

  if (req.method === 'GET' && resource === 'me' && !id) {
    const [profile, trips, journeys] = await Promise.all([loadProfile(uid), loadTrips(uid), journeysCol(uid).get()]);
    send(res, 200, {
      citizenship: profile.citizenship,
      has_fixed_residence: profile.hasFixedResidence,
      trips: trips.length,
      journeys: journeys.docs.filter((d) => d.get('deleted') !== true).length,
      first_trip: trips[0]?.start_date ?? null,
    });
    return;
  }

  if (req.method === 'GET' && resource === 'trips' && !id) {
    const from = query(req, 'from');
    const to = query(req, 'to');
    const trips = (await loadTrips(uid)).filter((t) =>
      (!from || (t.end_date ?? '9999-12-31') >= from) && (!to || t.start_date <= to),
    );
    send(res, 200, {
      trips: trips.map((t) => ({
        id: t.sync_id,
        city: t.city, country: t.country, country_code: t.country_code,
        start_date: t.start_date, end_date: t.end_date, days: t.days,
      })),
    });
    return;
  }

  if (resource === 'trips') {
    const col = tripsCol(uid);
    if (req.method === 'POST' && !id) {
      requireTimelineWrite(caller);
      const docId = randomUUID();
      await col.doc(docId).set({
        ...buildStay(req.body ?? {}, null),
        local_id: null,
        updated_at: Timestamp.now(),
        deleted: false,
        created_by: 'agent',
      });
      send(res, 201, publicTrip(docId, (await col.doc(docId).get()).data()!));
      return;
    }
    if (req.method === 'GET' && id) {
      const snap = await col.doc(id).get();
      if (!snap.exists || snap.get('deleted') === true) throw new ApiError(404, 'not-found', 'No such stay.');
      send(res, 200, publicTrip(id, snap.data()!));
      return;
    }
    if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
      requireTimelineWrite(caller);
      const ref = col.doc(id);
      const snap = await ref.get();
      if (!snap.exists || snap.get('deleted') === true) throw new ApiError(404, 'not-found', 'No such stay.');
      await ref.update({ ...buildStay(req.body ?? {}, snap.data()!), updated_at: Timestamp.now() });
      send(res, 200, publicTrip(id, (await ref.get()).data()!));
      return;
    }
    if (req.method === 'DELETE' && id) {
      requireTimelineWrite(caller);
      const ref = col.doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw new ApiError(404, 'not-found', 'No such stay.');
      await ref.update({ deleted: true, updated_at: Timestamp.now() });
      send(res, 200, { ok: true });
      return;
    }
  }

  if (req.method === 'GET' && resource === 'stats' && !id) {
    const y = query(req, 'year');
    const year = y ? Number(y) : null;
    if (y && !Number.isInteger(year)) throw new ApiError(400, 'invalid-argument', '"year" must be a number.');
    const [trips, profile] = await Promise.all([loadTrips(uid), loadProfile(uid)]);
    send(res, 200, statsFromTrips(trips, year, profile.citizenship?.countryCode ?? null, availableYearsFromTrips(trips), userToday(profile.timezone)));
    return;
  }

  if (req.method === 'GET' && (resource === 'visa' || resource === 'tax') && !id) {
    const [trips, profile, visas] = await Promise.all([loadTrips(uid), loadProfile(uid), loadVisas(uid)]);
    if (!profile.citizenship) throw new ApiError(409, 'no-citizenship', 'Set your citizenship in the app first.');
    if (resource === 'visa') {
      send(res, 200, { citizenship: profile.citizenship, statuses: calculateAllVisaStatuses(trips, profile.citizenship.countryCode, visas, userToday(profile.timezone)) });
    } else {
      send(res, 200, {
        citizenship: profile.citizenship,
        statuses: calculateAllTaxStatuses(trips, profile.citizenship.countryCode, profile.hasFixedResidence ?? true, userToday(profile.timezone).getFullYear(), userToday(profile.timezone)),
      });
    }
    return;
  }

  if (resource === 'journeys') {
    const col = journeysCol(uid);
    if (req.method === 'GET' && !id) {
      const [snap, plans] = await Promise.all([col.get(), accommodationSummaries(uid)]);
      send(res, 200, { journeys: snap.docs.filter((d) => d.get('deleted') !== true).map((d) => publicJourney(d.id, d.data(), plans)) });
      return;
    }
    if (req.method === 'GET' && id) {
      const [snap, plans] = await Promise.all([col.doc(id).get(), accommodationSummaries(uid)]);
      if (!snap.exists || snap.get('deleted') === true) throw new ApiError(404, 'not-found', 'No such journey.');
      send(res, 200, publicJourney(snap.id, snap.data()!, plans));
      return;
    }
    if (req.method === 'POST' && !id) {
      const body = req.body ?? {};
      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : '';
      if (!title) throw new ApiError(400, 'invalid-argument', '"title" is required.');
      const legs = buildLegs(body.stops);
      const docId = randomUUID();
      await col.doc(docId).set({
        title,
        legs,
        travellers: [{ sync_id: randomUUID(), name: 'You', sort_order: 0 }],
        local_id: null,
        updated_at: Timestamp.now(),
        deleted: false,
        created_by: 'agent',
      });
      const snap = await col.doc(docId).get();
      send(res, 201, publicJourney(docId, snap.data()!, new Map()));
      return;
    }
    if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
      const ref = col.doc(id);
      const snap = await ref.get();
      if (!snap.exists || snap.get('deleted') === true) throw new ApiError(404, 'not-found', 'No such journey.');
      const body = req.body ?? {};
      const patch: Record<string, unknown> = { updated_at: Timestamp.now() };
      if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 80);
      const before = (snap.get('legs') ?? []) as any[];
      if (body.stops !== undefined) patch.legs = buildLegs(body.stops, before);
      await ref.update(patch);
      // Plans are keyed by stop id and live in their own collection, so a
      // stop that kept its id (same city and country) keeps its plan and a
      // stop that was dropped takes its plan with it.
      if (body.stops !== undefined) {
        const kept = new Set((patch.legs as any[]).map((l) => l.sync_id));
        await tombstonePlansForStops(uid, before.map((l) => l.sync_id).filter((x) => x && !kept.has(x)));
      }
      send(res, 200, publicJourney(id, (await ref.get()).data()!, await accommodationSummaries(uid)));
      return;
    }
    if (req.method === 'DELETE' && id) {
      const ref = col.doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw new ApiError(404, 'not-found', 'No such journey.');
      await ref.update({ deleted: true, updated_at: Timestamp.now() });
      await tombstonePlansForJourney(uid, id);
      send(res, 200, { ok: true });
      return;
    }
  }

  throw new ApiError(404, 'not-found', 'Unknown route.');
}

/**
 * One request, answered. Exported so the tests can drive the API with a
 * fake request and response, outside the Functions runtime.
 */
export async function serve(req: Request, res: Response): Promise<void> {
  try {
    await handle(req, res);
  } catch (err) {
    if (err instanceof ApiError) {
      send(res, err.status, { error: { code: err.code, message: err.message } });
      return;
    }
    logger.error('agent api failed', { path: req.path, err: String(err) });
    send(res, 500, { error: { code: 'internal', message: 'Something went wrong on our side.' } });
  }
}

export const agentApi = onRequest({ region: REGION, memory: '512MiB', timeoutSeconds: 60, secrets: [revenueCatKey] }, serve);
