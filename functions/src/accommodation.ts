/**
 * Accommodation planning over the agent API.
 *
 * One plan per journey stop, stored at `users/{uid}/accommodations/{stopId}`
 * with its researched options embedded. The routes here only move data: an
 * agent researches elsewhere, saves what it found, the user picks, someone
 * books on the platform, and the booking details come back here. Nothing in
 * this file calls a booking site, touches the timeline (`trips`) or the
 * visa and tax data.
 *
 * Every change runs through the transitions in `lib/accommodationModel.ts`,
 * which the app uses too, so what the phone accepts and what the server
 * accepts is the same thing.
 */

import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';

import {
  ACCOMMODATION_STATUSES,
  AccommodationNotFoundError,
  AccommodationValidationError,
  EMPTY_REQUIREMENTS,
  addOption,
  clearBooking,
  createPlan,
  nightsBetween,
  primaryOption,
  removeOption,
  saveBooking,
  selectOption,
  setNotes,
  setStatus,
  staysMatchStop,
  updateOption,
  updatePlan,
  type AccommodationBooking,
  type AccommodationOption,
  type AccommodationPlan,
  type AccommodationRequirements,
  type AccommodationStatus,
} from '../../lib/accommodationModel';
import { ApiError, send, type Caller } from './api';

// ─── Storage ─────────────────────────────────────────────────────────────────

function plansCol(uid: string) {
  return getFirestore().collection(`users/${uid}/accommodations`);
}

function journeysCol(uid: string) {
  return getFirestore().collection(`users/${uid}/journeys`);
}

interface StoredPlan extends AccommodationPlan {
  updated_at: string | null;
}

function planFromDoc(id: string, x: FirebaseFirestore.DocumentData): StoredPlan {
  return {
    id,
    journey_id: String(x.journey_id ?? ''),
    stop_id: String(x.stop_id ?? id),
    needed: x.needed !== false,
    status: (ACCOMMODATION_STATUSES as readonly string[]).includes(x.status) ? (x.status as AccommodationStatus) : 'open',
    check_in: String(x.check_in ?? ''),
    check_out: String(x.check_out ?? ''),
    requirements: { ...EMPTY_REQUIREMENTS, ...(x.requirements ?? {}) } as AccommodationRequirements,
    options: (Array.isArray(x.options) ? x.options : []) as AccommodationOption[],
    selected_option_id: typeof x.selected_option_id === 'string' ? x.selected_option_id : null,
    booking: (x.booking ?? null) as AccommodationBooking | null,
    notes: typeof x.notes === 'string' ? x.notes : null,
    updated_at: x.updated_at instanceof Timestamp ? x.updated_at.toDate().toISOString() : null,
  };
}

/**
 * Write a plan as one document, whole. No merge: an option that was removed
 * has to leave the array. `local_id` and `created_by` survive from the
 * existing document because the phone and the logs care about them.
 */
async function storePlan(uid: string, plan: AccommodationPlan, existing: FirebaseFirestore.DocumentData | null): Promise<StoredPlan> {
  const ref = plansCol(uid).doc(plan.id);
  await ref.set({
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
    local_id: existing?.local_id ?? null,
    created_by: existing?.created_by ?? 'agent',
    updated_at: Timestamp.now(),
    synced_at: FieldValue.serverTimestamp(),
    deleted: false,
  });
  return planFromDoc(plan.id, (await ref.get()).data()!);
}

// ─── The stop a plan belongs to ──────────────────────────────────────────────

interface StopContext {
  journey_id: string;
  journey_title: string;
  stop: { id: string; city: string; country: string; country_code: string; start_date: string; end_date: string };
}

function stopContexts(journeyId: string, x: FirebaseFirestore.DocumentData): StopContext[] {
  const legs = (Array.isArray(x.legs) ? x.legs : []) as any[];
  return legs.map((l) => ({
    journey_id: journeyId,
    journey_title: String(x.title ?? ''),
    stop: {
      id: String(l.sync_id),
      city: String(l.city ?? ''),
      country: String(l.country ?? ''),
      country_code: String(l.country_code ?? ''),
      start_date: String(l.start_date ?? ''),
      end_date: String(l.end_date ?? ''),
    },
  }));
}

async function loadStop(uid: string, journeyId: string, stopId: string): Promise<StopContext> {
  const snap = await journeysCol(uid).doc(journeyId).get();
  if (!snap.exists || snap.get('deleted') === true) throw new ApiError(404, 'not-found', 'No such journey.');
  const ctx = stopContexts(journeyId, snap.data()!).find((c) => c.stop.id === stopId);
  if (!ctx) throw new ApiError(404, 'not-found', 'No such stop in this journey.');
  return ctx;
}

/** Every stop of every live journey, by stop id. */
async function loadAllStops(uid: string): Promise<Map<string, StopContext>> {
  const snap = await journeysCol(uid).get();
  const out = new Map<string, StopContext>();
  for (const d of snap.docs) {
    if (d.get('deleted') === true) continue;
    for (const ctx of stopContexts(d.id, d.data())) out.set(ctx.stop.id, ctx);
  }
  return out;
}

async function loadPlan(uid: string, stopId: string): Promise<{ plan: StoredPlan | null; raw: FirebaseFirestore.DocumentData | null }> {
  const snap = await plansCol(uid).doc(stopId).get();
  if (!snap.exists) return { plan: null, raw: null };
  const raw = snap.data()!;
  return { plan: raw.deleted === true ? null : planFromDoc(snap.id, raw), raw };
}

// ─── Shapes the agent sees ───────────────────────────────────────────────────

function publicPlan(plan: StoredPlan, ctx: StopContext) {
  return {
    id: plan.id,
    journey_id: ctx.journey_id,
    journey_title: ctx.journey_title,
    stop_id: plan.stop_id,
    stop: ctx.stop,
    needed: plan.needed,
    status: plan.status,
    check_in: plan.check_in,
    check_out: plan.check_out,
    nights: nightsBetween(plan.check_in, plan.check_out),
    // False when the stop moved after the plan was made. Say so to the user
    // rather than quietly moving a booking.
    dates_match_stop: staysMatchStop(plan, ctx.stop),
    requirements: plan.requirements,
    options: plan.options,
    selected_option_id: plan.selected_option_id,
    booking: plan.booking,
    notes: plan.notes,
    updated_at: plan.updated_at,
  };
}

/** The one-line view of a plan that rides along on every stop of a journey. */
export function accommodationSummary(plan: AccommodationPlan) {
  const primary = primaryOption(plan);
  return {
    status: plan.status,
    needed: plan.needed,
    check_in: plan.check_in,
    check_out: plan.check_out,
    nights: nightsBetween(plan.check_in, plan.check_out),
    options: plan.options.length,
    selected: primary ? primary.name : null,
    booked: plan.booking !== null,
  };
}

export type AccommodationSummary = ReturnType<typeof accommodationSummary>;

/** Summaries of every live plan, by stop id, for the journey responses. */
export async function accommodationSummaries(uid: string): Promise<Map<string, AccommodationSummary>> {
  const snap = await plansCol(uid).get();
  const out = new Map<string, AccommodationSummary>();
  for (const d of snap.docs) {
    if (d.get('deleted') === true) continue;
    out.set(d.id, accommodationSummary(planFromDoc(d.id, d.data())));
  }
  return out;
}

/**
 * A stop that is gone takes its plan with it, as a tombstone: the phone
 * does the same when a stop is deleted there, and a tombstone keeps every
 * field, so nothing is lost that an admin could not bring back.
 */
export async function tombstonePlansForStops(uid: string, stopIds: string[]): Promise<void> {
  const now = Timestamp.now();
  for (const stopId of stopIds) {
    const ref = plansCol(uid).doc(stopId);
    const snap = await ref.get();
    if (snap.exists && snap.get('deleted') !== true) await ref.update({ deleted: true, updated_at: now, synced_at: FieldValue.serverTimestamp() });
  }
}

export async function tombstonePlansForJourney(uid: string, journeyId: string): Promise<void> {
  const snap = await plansCol(uid).where('journey_id', '==', journeyId).get();
  await tombstonePlansForStops(uid, snap.docs.map((d) => d.id));
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/** Model complaints become API errors: bad values are 400, missing things 404. */
function asApiError(err: unknown): unknown {
  if (err instanceof AccommodationValidationError) return new ApiError(400, 'invalid-argument', err.message);
  if (err instanceof AccommodationNotFoundError) return new ApiError(404, 'not-found', err.message);
  return err;
}

function query(req: Request, name: string): string | null {
  const v = req.query[name];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** GET /accommodations?journey_id&status: every plan whose stop still exists. */
export async function listAccommodations(caller: Caller, req: Request, res: Response): Promise<void> {
  const journeyFilter = query(req, 'journey_id');
  const statusFilter = query(req, 'status');
  if (statusFilter && !(ACCOMMODATION_STATUSES as readonly string[]).includes(statusFilter)) {
    throw new ApiError(400, 'invalid-argument', `status must be one of ${ACCOMMODATION_STATUSES.join(', ')}.`);
  }
  const [stops, snap] = await Promise.all([loadAllStops(caller.uid), plansCol(caller.uid).get()]);
  const plans = snap.docs
    .filter((d) => d.get('deleted') !== true)
    .map((d) => planFromDoc(d.id, d.data()))
    .filter((p) => stops.has(p.stop_id))
    .filter((p) => !journeyFilter || stops.get(p.stop_id)!.journey_id === journeyFilter)
    .filter((p) => !statusFilter || p.status === statusFilter)
    .sort((a, b) => a.check_in.localeCompare(b.check_in))
    .map((p) => publicPlan(p, stops.get(p.stop_id)!));
  send(res, 200, { accommodations: plans });
}

/**
 * Everything under /journeys/{id}/stops/{stopId}/accommodation. `rest` is
 * what follows: nothing, `options`, `options/{optionId}`,
 * `options/{optionId}/select`, `booking`, `status` or `notes`.
 *
 * Any token may write here. Accommodation is planning, like the journeys
 * themselves, which every token may create and change; the `edit_timeline`
 * flag guards the tracked past (`/trips`) and only that. Nothing in this
 * module can reach `trips`, `visas` or the profile.
 */
export async function handleAccommodationRoute(
  caller: Caller,
  req: Request,
  res: Response,
  journeyId: string,
  stopId: string,
  rest: string[],
): Promise<void> {
  try {
    await route(caller, req, res, journeyId, stopId, rest);
  } catch (err) {
    throw asApiError(err);
  }
}

async function route(caller: Caller, req: Request, res: Response, journeyId: string, stopId: string, rest: string[]): Promise<void> {
  const { uid } = caller;
  const ctx = await loadStop(uid, journeyId, stopId);
  const { plan, raw } = await loadPlan(uid, stopId);
  const body = req.body ?? {};
  const write = req.method === 'PUT' || req.method === 'PATCH';
  const reply = async (next: AccommodationPlan, status = 200) => send(res, status, publicPlan(await storePlan(uid, next, raw), ctx));
  const require = (): StoredPlan => {
    if (!plan) throw new ApiError(404, 'not-found', 'No accommodation plan for this stop yet. PUT one first.');
    return plan;
  };

  if (rest.length === 0) {
    if (req.method === 'GET') {
      send(res, 200, publicPlan(require(), ctx));
      return;
    }
    if (write) {
      if (plan) {
        await reply(updatePlan(plan, body));
      } else {
        await reply(createPlan(journeyId, { id: stopId, start_date: ctx.stop.start_date, end_date: ctx.stop.end_date }, body), 201);
      }
      return;
    }
    if (req.method === 'DELETE') {
      require();
      await plansCol(uid).doc(stopId).update({ deleted: true, updated_at: Timestamp.now(), synced_at: FieldValue.serverTimestamp() });
      send(res, 200, { ok: true });
      return;
    }
  }

  if (rest[0] === 'options') {
    const optionId = rest[1];
    if (rest.length === 1 && req.method === 'POST') {
      // Finding places is the first thing an agent does; it should not need
      // to file the requirements before it may save what it found.
      const base = plan ?? createPlan(journeyId, { id: stopId, start_date: ctx.stop.start_date, end_date: ctx.stop.end_date });
      await reply(addOption(base, body, randomUUID()), 201);
      return;
    }
    if (rest.length === 2 && optionId && write) {
      await reply(updateOption(require(), optionId, body));
      return;
    }
    if (rest.length === 2 && optionId && req.method === 'DELETE') {
      await reply(removeOption(require(), optionId));
      return;
    }
    if (rest.length === 3 && optionId && rest[2] === 'select' && req.method === 'POST') {
      await reply(selectOption(require(), optionId));
      return;
    }
  }

  if (rest.length === 1 && rest[0] === 'booking') {
    if (write) {
      await reply(saveBooking(require(), body));
      return;
    }
    if (req.method === 'DELETE') {
      await reply(clearBooking(require()));
      return;
    }
  }

  if (rest.length === 1 && rest[0] === 'status' && (write || req.method === 'POST')) {
    await reply(setStatus(require(), body.status));
    return;
  }

  if (rest.length === 1 && rest[0] === 'notes') {
    if (req.method === 'GET') {
      const p = require();
      send(res, 200, {
        notes: p.notes,
        requirements_notes: p.requirements.notes,
        options: p.options.map((o) => ({ id: o.id, name: o.name, risks: o.risks, notes: o.notes })),
        booking_notes: p.booking?.notes ?? null,
      });
      return;
    }
    if (write) {
      await reply(setNotes(require(), body.notes));
      return;
    }
  }

  throw new ApiError(404, 'not-found', 'Unknown route.');
}
