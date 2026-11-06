/**
 * Expenses on a trip, over the agent API.
 *
 * One document per expense at `users/{uid}/expenses/{expenseId}`, tagged
 * with its journey and stop, like activities. Who paid and the shares name
 * the journey's travellers by their ids; a traveller the journey does not
 * have is refused, so a split never points at nobody.
 *
 * Every write runs through `normalizeExpense` in `lib/expenseModel.ts`,
 * which the app's forms use too, and the sums (`totals`, `balances`,
 * `settleUp`) come from the same file, so the agent reads the numbers the
 * app shows. Keeping track only: nothing here touches the timeline, visas
 * or tax.
 */

import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';

import { AccommodationValidationError } from '../../lib/accommodationModel';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_SOURCES,
  MAX_EXPENSES_PER_JOURNEY,
  balances,
  normalizeExpense,
  settleUp,
  sortExpenses,
  totals,
  type Expense,
  type ExpenseFields,
  type ExpenseShare,
} from '../../lib/expenseModel';
import { ApiError, send, type Caller } from './api';

// ─── Storage ─────────────────────────────────────────────────────────────────

function expensesCol(uid: string) {
  return getFirestore().collection(`users/${uid}/expenses`);
}

function choice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && (choices as readonly string[]).includes(value) ? (value as T) : fallback;
}

const textOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function sharesOf(v: unknown): ExpenseShare[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s) => s && typeof s === 'object' && typeof (s as any).traveller_id === 'string' && typeof (s as any).amount === 'number')
    .map((s) => ({ traveller_id: (s as any).traveller_id as string, amount: (s as any).amount as number }));
}

/**
 * A stored expense as the API shows it. Lenient on purpose: the phone
 * writes these documents too, and a field an older build left out should
 * read as empty, not fail the whole list.
 */
export function expenseFromDoc(id: string, x: FirebaseFirestore.DocumentData): Expense {
  return {
    id,
    journey_id: String(x.journey_id ?? ''),
    stop_id: typeof x.stop_id === 'string' && x.stop_id ? x.stop_id : null,
    title: String(x.title ?? ''),
    amount: numOrNull(x.amount) ?? 0,
    currency: String(x.currency ?? ''),
    paid_by: textOrNull(x.paid_by),
    shares: sharesOf(x.shares),
    date: String(x.date ?? ''),
    category: choice(x.category, EXPENSE_CATEGORIES, 'other'),
    notes: textOrNull(x.notes),
    receipt_document_id: textOrNull(x.receipt_document_id),
    source: choice(x.source, EXPENSE_SOURCES, 'manual'),
    updated_at: x.updated_at instanceof Timestamp ? x.updated_at.toDate().toISOString() : '',
    deleted: x.deleted === true,
  };
}

function fieldsOf(e: Expense): ExpenseFields {
  const { id: _i, journey_id: _j, stop_id: _s, updated_at: _u, deleted: _d, ...fields } = e;
  return fields;
}

/** The public shape: everything but the tombstone flag, which a live expense never has set. */
function publicExpense(e: Expense) {
  const { deleted: _d, ...rest } = e;
  return { ...rest, updated_at: e.updated_at || null };
}

async function store(uid: string, id: string, journeyId: string, stopId: string | null, fields: ExpenseFields): Promise<Expense> {
  const ref = expensesCol(uid).doc(id);
  await ref.set({
    journey_id: journeyId,
    stop_id: stopId,
    ...fields,
    updated_at: Timestamp.now(),
    synced_at: FieldValue.serverTimestamp(),
    deleted: false,
  });
  return expenseFromDoc(id, (await ref.get()).data()!);
}

// ─── The journey they hang off ───────────────────────────────────────────────

interface JourneyShape {
  stopIds: string[];
  /** Stops with their dates, to place an expense by its day. */
  stops: { id: string; start_date: string; end_date: string }[];
  travellerIds: string[];
}

/** The stops and travellers of a live journey; 404 when there is no such journey. */
async function loadJourney(uid: string, journeyId: string): Promise<JourneyShape> {
  const snap = await getFirestore().collection(`users/${uid}/journeys`).doc(journeyId).get();
  if (!snap.exists || snap.get('deleted') === true) throw new ApiError(404, 'not-found', 'No such journey.');
  return shapeOf(snap.data()!);
}

/** The same, from a journey document (or the shared mirror, which carries the same fields). */
export function shapeOf(x: FirebaseFirestore.DocumentData): JourneyShape {
  const legs = Array.isArray(x.legs) ? (x.legs as any[]) : [];
  const travellers = Array.isArray(x.travellers) ? (x.travellers as any[]) : [];
  const stops = legs
    .map((l) => ({ id: String(l?.sync_id ?? ''), start_date: String(l?.start_date ?? ''), end_date: String(l?.end_date ?? '') }))
    .filter((l) => l.id);
  return {
    stopIds: stops.map((s) => s.id),
    stops,
    travellerIds: travellers.map((t) => String(t?.sync_id ?? '')).filter(Boolean),
  };
}

async function liveExpenses(uid: string, journeyId: string): Promise<Expense[]> {
  const snap = await expensesCol(uid).where('journey_id', '==', journeyId).get();
  return snap.docs.filter((d) => d.get('deleted') !== true).map((d) => expenseFromDoc(d.id, d.data()));
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

/** The stop whose days hold the date, for an expense that did not say. */
export function stopForDate(shape: JourneyShape, date: string): string | null {
  return shape.stops.find((s) => s.start_date <= date && date <= s.end_date)?.id ?? null;
}

/**
 * Who paid and who shares must be travellers of this journey. A journey
 * without travellers (the owner never opened the wallet) can still carry
 * expenses, just not split ones.
 */
export function checkTravellers(fields: Pick<ExpenseFields, 'paid_by' | 'shares'>, travellerIds: string[]): void {
  const unknown = (id: string) => !travellerIds.includes(id);
  if (fields.paid_by && unknown(fields.paid_by)) {
    throw new ApiError(400, 'invalid-argument', `paid_by must be one of the journey's travellers: ${travellerIds.join(', ') || 'none yet'}.`);
  }
  const bad = fields.shares.find((s) => unknown(s.traveller_id));
  if (bad) {
    throw new ApiError(400, 'invalid-argument', `Share for unknown traveller ${bad.traveller_id}. The journey's travellers are: ${travellerIds.join(', ') || 'none yet'}.`);
  }
}

const today = () => new Date().toISOString().slice(0, 10);

/** The sums the app shows, for the list response. */
export function summaryOf(list: Expense[]) {
  return { totals: totals(list), balances: balances(list), settle_up: settleUp(list) };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

function asApiError(err: unknown): unknown {
  if (err instanceof AccommodationValidationError) return new ApiError(400, 'invalid-argument', err.message);
  return err;
}

/**
 * A journey that is gone takes its expenses with it, tombstoned so the
 * phones learn about it on their next pull (and the mirror drops them).
 */
export async function tombstoneExpensesForJourney(uid: string, journeyId: string): Promise<void> {
  const snap = await getFirestore().collection(`users/${uid}/expenses`).where('journey_id', '==', journeyId).get();
  for (const d of snap.docs) {
    if (d.get('deleted') === true) continue;
    await d.ref.update({ deleted: true, updated_at: Timestamp.now(), synced_at: FieldValue.serverTimestamp() });
  }
}

/**
 * Everything under /journeys/{id}/expenses, and the create under
 * /journeys/{id}/stops/{stopId}/expenses (`stopId` set, `rest` empty).
 * `rest` is what follows `expenses`: nothing or `{expenseId}`.
 *
 * Any token may write here, like activities: keeping track, not the
 * tracked past.
 */
export async function handleExpenseRoute(
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
  const shape = await loadJourney(uid, journeyId);
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};

  if (pathStop !== null) {
    if (!shape.stopIds.includes(pathStop)) throw new ApiError(404, 'not-found', 'No such stop in this journey.');
    if (rest.length === 0 && req.method === 'POST') {
      await create(uid, res, journeyId, shape, pathStop, body);
      return;
    }
    throw new ApiError(404, 'not-found', 'Unknown route.');
  }

  if (rest.length === 0) {
    if (req.method === 'GET') {
      const filter = typeof req.query.stop === 'string' && req.query.stop ? req.query.stop : null;
      const all = sortExpenses(await liveExpenses(uid, journeyId));
      const list = all.filter((e) => !filter || e.stop_id === filter);
      // The sums are always the whole trip's: a balance per stop means nothing.
      send(res, 200, { expenses: list.map(publicExpense), travellers: shape.travellerIds, ...summaryOf(all) });
      return;
    }
    if (req.method === 'POST') {
      await create(uid, res, journeyId, shape, undefined, body);
      return;
    }
  }

  if (rest.length === 1 && rest[0]) {
    const id = rest[0];
    const ref = expensesCol(uid).doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.get('deleted') === true || snap.get('journey_id') !== journeyId) {
      throw new ApiError(404, 'not-found', 'No such expense in this journey.');
    }
    const current = expenseFromDoc(id, snap.data()!);
    if (req.method === 'GET') {
      send(res, 200, publicExpense(current));
      return;
    }
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const fields = normalizeExpense(body, fieldsOf(current));
      checkTravellers(fields, shape.travellerIds);
      // A new date without a stop said: the expense follows the date.
      const fallbackStop = body.date !== undefined && body.stop_id === undefined ? stopForDate(shape, fields.date) : current.stop_id;
      const stopId = pickStop(body.stop_id, fallbackStop, shape.stopIds);
      send(res, 200, publicExpense(await store(uid, id, journeyId, stopId, fields)));
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

/**
 * A new expense. Filed by an agent unless it says otherwise. Split among
 * everyone on the trip when the body says nothing about the split; put on
 * the stop whose days hold its date when the body names none.
 */
async function create(uid: string, res: Response, journeyId: string, shape: JourneyShape, pathStop: string | undefined, body: Record<string, unknown>): Promise<void> {
  const input: Record<string, unknown> = { source: 'agent', ...body };
  if (input.shares === undefined && input.split_among === undefined && shape.travellerIds.length > 0) input.split_among = shape.travellerIds;
  const fields = normalizeExpense(input, null, { today: today() });
  checkTravellers(fields, shape.travellerIds);
  const live = await liveExpenses(uid, journeyId);
  if (live.length >= MAX_EXPENSES_PER_JOURNEY) {
    throw new ApiError(400, 'invalid-argument', `A journey can hold at most ${MAX_EXPENSES_PER_JOURNEY} expenses. Delete some first.`);
  }
  const stopId = pathStop !== undefined ? pathStop : pickStop(body.stop_id, stopForDate(shape, fields.date), shape.stopIds);
  send(res, 201, publicExpense(await store(uid, randomUUID(), journeyId, stopId, fields)));
}
