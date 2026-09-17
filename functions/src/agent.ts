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
import type { Response } from 'express';

import { calculateAllVisaStatuses } from '../../lib/visaCalculations';
import { calculateAllTaxStatuses } from '../../lib/taxCalculations';
import { statsFromTrips } from '../../lib/stats';
import { availableYearsFromTrips } from '../../lib/yearFilter';
import { chainDates, toYmd } from '../../lib/days';
import type { Trip } from '../../lib/database';
import type { UserVisa } from '../../lib/userVisas';
import { findCityCoords, getCountryCode, getCountryName } from '../../utils/geography';

const REGION = 'us-central1';
const TOKENS = 'agent_tokens';
const TOKEN_PREFIX = 'nmd_';
const MAX_TOKENS_PER_USER = 5;
const MAX_STOPS = 60;
const TRANSPORTS = new Set(['flight', 'train', 'car', 'bus', 'ferry', 'walk']);

// ─── Tokens (callable, from the app) ──────────────────────────────────────────

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function requireUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return uid;
}

export const createAgentToken = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const label = typeof request.data?.label === 'string' ? request.data.label.trim().slice(0, 40) : '';
  const db = getFirestore();

  const existing = await db.collection(TOKENS).where('uid', '==', uid).get();
  if (existing.size >= MAX_TOKENS_PER_USER) {
    throw new HttpsError('resource-exhausted', `You can have at most ${MAX_TOKENS_PER_USER} tokens. Revoke one first.`);
  }

  const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
  const id = hashToken(token);
  await db.collection(TOKENS).doc(id).set({
    uid,
    label: label || 'Agent',
    // Enough to recognise a token in a config file, useless for guessing it.
    prefix: token.slice(0, TOKEN_PREFIX.length + 6),
    created_at: FieldValue.serverTimestamp(),
    last_used_at: null,
  });
  logger.info('agent token created', { uid, id: id.slice(0, 8) });
  // The only time the token itself leaves the server.
  return { id, token, label: label || 'Agent' };
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
        created_at: stamp(d.get('created_at')),
        last_used_at: stamp(d.get('last_used_at')),
      }))
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')),
  };
});

// ─── The API (bearer token, from the agent) ───────────────────────────────────

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function authenticate(req: Request): Promise<string> {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match || !match[1].startsWith(TOKEN_PREFIX)) {
    throw new ApiError(401, 'unauthenticated', 'Send the token as "Authorization: Bearer nmd_…".');
  }
  const ref = getFirestore().collection(TOKENS).doc(hashToken(match[1]));
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(401, 'unauthenticated', 'Unknown or revoked token.');
  ref.update({ last_used_at: FieldValue.serverTimestamp() }).catch(() => {});
  return snap.get('uid') as string;
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
  return { citizenship, hasFixedResidence: typeof x.hasFixedResidence === 'boolean' ? x.hasFixedResidence : null };
}

function journeysCol(uid: string) {
  return getFirestore().collection(`users/${uid}/journeys`);
}

function publicJourney(id: string, x: FirebaseFirestore.DocumentData) {
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
    })),
    travellers: (Array.isArray(x.travellers) ? x.travellers : []).map((t: any) => t.name),
  };
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
  const draft = input.map((raw: StopInput, i) => {
    if (!raw || typeof raw.city !== 'string' || !raw.city.trim()) throw new ApiError(400, 'invalid-argument', `stops[${i}].city is required.`);
    const city = raw.city.trim().slice(0, 80);
    const code = (typeof raw.country_code === 'string' && raw.country_code.length === 2
      ? raw.country_code
      : typeof raw.country === 'string' ? getCountryCode(raw.country) : '').toUpperCase();
    if (!code || code.length !== 2) throw new ApiError(400, 'invalid-argument', `stops[${i}]: country or country_code is required.`);
    const country = getCountryName(code) ?? (typeof raw.country === 'string' ? raw.country : code);
    const transport = typeof raw.transport === 'string' && TRANSPORTS.has(raw.transport) ? raw.transport : 'flight';
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
    // updates it rather than replacing it.
    const prior = existing.find((l) => l.city === city && l.country_code === code);
    const coords = findCityCoords(city, code);
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

// ── Routing ──

function send(res: Response, status: number, body: unknown) {
  res.status(status).set('Cache-Control', 'no-store').json(body);
}

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

  const uid = await authenticate(req);
  const [, v1, resource, id] = path.split('/');
  if (v1 !== 'v1') throw new ApiError(404, 'not-found', 'Unknown route.');

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
        city: t.city, country: t.country, country_code: t.country_code,
        start_date: t.start_date, end_date: t.end_date, days: t.days,
      })),
    });
    return;
  }

  if (req.method === 'GET' && resource === 'stats' && !id) {
    const y = query(req, 'year');
    const year = y ? Number(y) : null;
    if (y && !Number.isInteger(year)) throw new ApiError(400, 'invalid-argument', '"year" must be a number.');
    const [trips, profile] = await Promise.all([loadTrips(uid), loadProfile(uid)]);
    send(res, 200, statsFromTrips(trips, year, profile.citizenship?.countryCode ?? null, availableYearsFromTrips(trips)));
    return;
  }

  if (req.method === 'GET' && (resource === 'visa' || resource === 'tax') && !id) {
    const [trips, profile, visas] = await Promise.all([loadTrips(uid), loadProfile(uid), loadVisas(uid)]);
    if (!profile.citizenship) throw new ApiError(409, 'no-citizenship', 'Set your citizenship in the app first.');
    if (resource === 'visa') {
      send(res, 200, { citizenship: profile.citizenship, statuses: calculateAllVisaStatuses(trips, profile.citizenship.countryCode, visas) });
    } else {
      send(res, 200, {
        citizenship: profile.citizenship,
        statuses: calculateAllTaxStatuses(trips, profile.citizenship.countryCode, profile.hasFixedResidence ?? true),
      });
    }
    return;
  }

  if (resource === 'journeys') {
    const col = journeysCol(uid);
    if (req.method === 'GET' && !id) {
      const snap = await col.get();
      send(res, 200, { journeys: snap.docs.filter((d) => d.get('deleted') !== true).map((d) => publicJourney(d.id, d.data())) });
      return;
    }
    if (req.method === 'GET' && id) {
      const snap = await col.doc(id).get();
      if (!snap.exists || snap.get('deleted') === true) throw new ApiError(404, 'not-found', 'No such journey.');
      send(res, 200, publicJourney(snap.id, snap.data()!));
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
      send(res, 201, publicJourney(docId, snap.data()!));
      return;
    }
    if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
      const ref = col.doc(id);
      const snap = await ref.get();
      if (!snap.exists || snap.get('deleted') === true) throw new ApiError(404, 'not-found', 'No such journey.');
      const body = req.body ?? {};
      const patch: Record<string, unknown> = { updated_at: Timestamp.now() };
      if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 80);
      if (body.stops !== undefined) patch.legs = buildLegs(body.stops, snap.get('legs') ?? []);
      await ref.update(patch);
      send(res, 200, publicJourney(id, (await ref.get()).data()!));
      return;
    }
    if (req.method === 'DELETE' && id) {
      const ref = col.doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw new ApiError(404, 'not-found', 'No such journey.');
      await ref.update({ deleted: true, updated_at: Timestamp.now() });
      send(res, 200, { ok: true });
      return;
    }
  }

  throw new ApiError(404, 'not-found', 'Unknown route.');
}

export const agentApi = onRequest({ region: REGION, memory: '512MiB', timeoutSeconds: 60 }, async (req, res) => {
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
});

// ─── Tool description ─────────────────────────────────────────────────────────

function openapi() {
  const auth = { security: [{ bearer: [] }] };
  const stop = {
    type: 'object',
    required: ['city', 'country'],
    properties: {
      city: { type: 'string' },
      country: { type: 'string', description: 'Country name; or give country_code' },
      country_code: { type: 'string', description: 'ISO 3166-1 alpha-2' },
      start_date: { type: 'string', format: 'date', description: 'Only needed on the first stop; later stops start the day after the previous one ends' },
      end_date: { type: 'string', format: 'date' },
      days: { type: 'integer', minimum: 1, description: 'Length of the stay; alternative to end_date' },
      transport: { type: 'string', enum: [...TRANSPORTS], description: 'How you get there' },
      notes: { type: 'string' },
    },
  };
  return {
    openapi: '3.1.0',
    info: {
      title: 'Nomadu agent API',
      version: '1.0.0',
      description: 'Where the user has been, how their visa and tax days stand, and the trips they are planning. Dates are YYYY-MM-DD calendar days.',
    },
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
    paths: {
      '/v1/me': { get: { ...auth, summary: 'Profile: citizenship, residence, counts' } },
      '/v1/trips': {
        get: {
          ...auth,
          summary: 'Tracked stays: where the user was and when',
          parameters: [
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Only stays ending on or after this day' },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Only stays starting on or before this day' },
          ],
        },
      },
      '/v1/stats': {
        get: {
          ...auth,
          summary: 'Days away from home, countries, cities, stops; for a year or all time',
          parameters: [{ name: 'year', in: 'query', schema: { type: 'integer' } }],
        },
      },
      '/v1/visa': { get: { ...auth, summary: 'Visa allowance per destination: days allowed, used and remaining, and a status' } },
      '/v1/tax': { get: { ...auth, summary: 'Tax residency exposure per country for the current year' } },
      '/v1/journeys': {
        get: { ...auth, summary: 'Planned trips with their stops' },
        post: {
          ...auth,
          summary: 'Create a planned trip. Stops chain: each starts the day after the previous one ends.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['title', 'stops'], properties: { title: { type: 'string' }, stops: { type: 'array', items: stop } } } } },
          },
        },
      },
      '/v1/journeys/{id}': {
        get: { ...auth, summary: 'One planned trip', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] },
        patch: {
          ...auth,
          summary: 'Rename a trip or replace its stops',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, stops: { type: 'array', items: stop } } } } } },
        },
        delete: { ...auth, summary: 'Delete a planned trip', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] },
      },
    },
  };
}
