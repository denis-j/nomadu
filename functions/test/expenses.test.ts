import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { Timestamp, __get, __reset, __seed } from './fakeFirestore';
import { serve } from '../src/agent';
import { expenseMirrorEntry, join, refreshMirrorExpense, setMemberCanEdit, share, updateSharedExpenseFor } from '../src/share';
import { balances, equalShares, normalizeExpense, parseQuickEntry, rescaleShares, settleUp, totals } from '../../lib/expenseModel';

process.env.ENTITLEMENT_MODE = 'off';

// ─── Harness ─────────────────────────────────────────────────────────────────

const RW = 'nmd_readwrite';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function call(method: string, path: string, { token = RW, body, query = {} }: { token?: string; body?: unknown; query?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  const req: any = { method, path: `/v1${path}`, query, body, get: (name: string) => headers[name.toLowerCase()] };
  const reply: { status: number; body: any } = { status: 0, body: undefined };
  const res: any = {
    status(s: number) { reply.status = s; return res; },
    set() { return res; },
    json(b: unknown) { reply.body = b; },
    send(b: unknown) { reply.body = b; },
  };
  await serve(req, res);
  return reply;
}

const LEGS = [
  { sync_id: 's1', city: 'Hanoi', country: 'Vietnam', country_code: 'VN', start_date: '2026-11-01', end_date: '2026-11-04', transport: 'flight', notes: null, sort_order: 0 },
  { sync_id: 's2', city: 'Da Nang', country: 'Vietnam', country_code: 'VN', start_date: '2026-11-05', end_date: '2026-11-07', transport: 'train', notes: null, sort_order: 1 },
];
const TRAVELLERS = [
  { sync_id: 'me', name: 'You', sort_order: 0, uid: 'u1' },
  { sync_id: 'anna', name: 'Anna', sort_order: 1, uid: null },
  { sync_id: 'ben', name: 'Ben', sort_order: 2, uid: null },
];

const rejects = async (work: Promise<unknown>, code: string) => {
  await assert.rejects(work, (err: any) => err.code === code, `expected ${code}`);
};

beforeEach(() => {
  __reset();
  __seed(`agent_tokens/${sha(RW)}`, { uid: 'u1', edit_timeline: false, label: 'rw' });
  __seed('users/u1/journeys/j1', { title: 'Vietnam', legs: LEGS, travellers: TRAVELLERS, updated_at: Timestamp.now(), deleted: false });
});

// ─── The model ───────────────────────────────────────────────────────────────

describe('splitting and settling', () => {
  test('equal shares come out to the cent, the odd cents first', () => {
    assert.deepEqual(equalShares(10, ['a', 'b', 'c']), [{ traveller_id: 'a', amount: 3.34 }, { traveller_id: 'b', amount: 3.33 }, { traveller_id: 'c', amount: 3.33 }]);
    assert.deepEqual(equalShares(42.5, ['a', 'a', 'b']), [{ traveller_id: 'a', amount: 21.25 }, { traveller_id: 'b', amount: 21.25 }]);
    assert.deepEqual(equalShares(5, []), []);
  });

  test('a split scales with a new amount, proportions kept', () => {
    const shares = [{ traveller_id: 'a', amount: 70 }, { traveller_id: 'b', amount: 30 }];
    assert.deepEqual(rescaleShares(shares, 50), [{ traveller_id: 'a', amount: 35 }, { traveller_id: 'b', amount: 15 }]);
    const sum = rescaleShares(shares, 33.33).reduce((s, x) => s + x.amount, 0);
    assert.equal(Math.round(sum * 100), 3333);
  });

  test('balances and the fewest payments', () => {
    const list = [
      { amount: 90, currency: 'EUR', paid_by: 'me', shares: equalShares(90, ['me', 'anna', 'ben']), deleted: false },
      { amount: 30, currency: 'EUR', paid_by: 'anna', shares: equalShares(30, ['me', 'anna', 'ben']), deleted: false },
      { amount: 12, currency: 'EUR', paid_by: 'ben', shares: [], deleted: false },
      { amount: 500, currency: 'THB', paid_by: 'anna', shares: equalShares(500, ['me', 'anna']), deleted: false },
      { amount: 999, currency: 'EUR', paid_by: 'ben', shares: [], deleted: true },
    ];
    assert.deepEqual(totals(list), [{ currency: 'THB', total: 500 }, { currency: 'EUR', total: 132 }]);
    const eur = balances(list).filter((b) => b.currency === 'EUR');
    assert.deepEqual(eur.find((b) => b.traveller_id === 'me'), { traveller_id: 'me', currency: 'EUR', paid: 90, owed: 40, net: 50 });
    assert.deepEqual(eur.find((b) => b.traveller_id === 'ben'), { traveller_id: 'ben', currency: 'EUR', paid: 12, owed: 52, net: -40 });
    assert.deepEqual(settleUp(list), [
      { from: 'ben', to: 'me', amount: 40, currency: 'EUR' },
      { from: 'anna', to: 'me', amount: 10, currency: 'EUR' },
      { from: 'me', to: 'anna', amount: 250, currency: 'THB' },
    ]);
  });

  test('one typed line comes apart into what, how much and in what', () => {
    assert.deepEqual(parseQuickEntry('Dinner 42', 'EUR'), { title: 'Dinner', amount: 42, currency: 'EUR' });
    assert.deepEqual(parseQuickEntry('Taxi 12,50€', 'THB'), { title: 'Taxi', amount: 12.5, currency: 'EUR' });
    assert.deepEqual(parseQuickEntry('$15 lunch', 'EUR'), { title: 'Lunch', amount: 15, currency: 'USD' });
    assert.deepEqual(parseQuickEntry('beer 3.5 thb', 'EUR'), { title: 'Beer', amount: 3.5, currency: 'THB' });
    assert.deepEqual(parseQuickEntry('1.200,50 hotel', 'EUR'), { title: 'Hotel', amount: 1200.5, currency: 'EUR' });
    assert.deepEqual(parseQuickEntry('1,200 for the car', 'USD'), { title: 'For the car', amount: 1200, currency: 'USD' });
    assert.deepEqual(parseQuickEntry('42', 'EUR'), { title: '', amount: 42, currency: 'EUR' });
    assert.equal(parseQuickEntry('Dinner', 'EUR'), null);
    assert.equal(parseQuickEntry('', 'EUR'), null);
  });

  test('normalize: a new one needs title, amount and currency; shares must add up', () => {
    const e = normalizeExpense({ title: 'Dinner', amount: 42.5, currency: 'eur', split_among: ['me', 'anna'] }, null, { today: '2026-11-02' });
    assert.equal(e.currency, 'EUR');
    assert.equal(e.date, '2026-11-02');
    assert.deepEqual(e.shares, [{ traveller_id: 'me', amount: 21.25 }, { traveller_id: 'anna', amount: 21.25 }]);
    assert.throws(() => normalizeExpense({ amount: 1, currency: 'EUR' }), /title/);
    assert.throws(() => normalizeExpense({ title: 'X', currency: 'EUR' }), /amount/);
    assert.throws(() => normalizeExpense({ title: 'X', amount: 0, currency: 'EUR' }), /more than 0/);
    assert.throws(() => normalizeExpense({ title: 'X', amount: 10 }), /currency/);
    assert.throws(() => normalizeExpense({ title: 'X', amount: 10, currency: 'EUR', shares: [{ traveller_id: 'a', amount: 3 }] }), /add up/);
    assert.throws(() => normalizeExpense({ title: 'X', amount: 10, currency: 'EUR', date: '2026-02-30' }), /date/);
    const patched = normalizeExpense({ amount: 20 }, e);
    assert.deepEqual(patched.shares, [{ traveller_id: 'me', amount: 10 }, { traveller_id: 'anna', amount: 10 }]);
  });
});

// ─── Agent routes ────────────────────────────────────────────────────────────

describe('expenses over the agent API', () => {
  test('an agent files an expense; split among everyone, placed by its day', async () => {
    const r = await call('POST', '/journeys/j1/expenses', { body: { title: 'Dinner', amount: 90, currency: 'eur', paid_by: 'me', date: '2026-11-06' } });
    assert.equal(r.status, 201);
    assert.match(r.body.id, /^[0-9a-f-]{36}$/);
    assert.equal(r.body.stop_id, 's2', 'the stop whose days hold the date');
    assert.equal(r.body.currency, 'EUR');
    assert.equal(r.body.source, 'agent');
    assert.deepEqual(r.body.shares.map((s: any) => s.traveller_id), ['me', 'anna', 'ben']);
    assert.equal(r.body.shares.reduce((s: number, x: any) => s + x.amount, 0), 90);
    const stored = __get(`users/u1/expenses/${r.body.id}`)!;
    assert.equal(stored.deleted, false);
    assert.ok(stored.synced_at);
  });

  test('who paid and who shares must be travellers; stops must be on the trip', async () => {
    const stranger = await call('POST', '/journeys/j1/expenses', { body: { title: 'X', amount: 1, currency: 'EUR', paid_by: 'zoe' } });
    assert.equal(stranger.status, 400);
    assert.match(stranger.body.error.message, /travellers: me, anna, ben/);
    assert.equal((await call('POST', '/journeys/j1/expenses', { body: { title: 'X', amount: 1, currency: 'EUR', split_among: ['me', 'zoe'] } })).status, 400);
    assert.equal((await call('POST', '/journeys/j1/expenses', { body: { title: 'X', amount: 1, currency: 'EUR', stop_id: 'nope' } })).status, 400);
    assert.equal((await call('POST', '/journeys/j1/stops/nope/expenses', { body: { title: 'X', amount: 1, currency: 'EUR' } })).status, 404);
    assert.equal((await call('GET', '/journeys/gone/expenses')).status, 404);
  });

  test('the list carries the sums; a stop filter narrows the list, not the sums', async () => {
    await call('POST', '/journeys/j1/stops/s1/expenses', { body: { title: 'Pho', amount: 30, currency: 'EUR', paid_by: 'anna', date: '2026-11-02' } });
    await call('POST', '/journeys/j1/stops/s2/expenses', { body: { title: 'Taxi', amount: 12, currency: 'EUR', paid_by: 'ben', split_among: ['ben'], date: '2026-11-06' } });
    const doomed = await call('POST', '/journeys/j1/expenses', { body: { title: 'Doomed', amount: 5, currency: 'EUR' } });
    assert.equal((await call('DELETE', `/journeys/j1/expenses/${doomed.body.id}`)).status, 200);

    const all = await call('GET', '/journeys/j1/expenses');
    assert.equal(all.status, 200);
    assert.deepEqual(all.body.expenses.map((e: any) => e.title), ['Taxi', 'Pho']);
    assert.deepEqual(all.body.travellers, ['me', 'anna', 'ben']);
    assert.deepEqual(all.body.totals, [{ currency: 'EUR', total: 42 }]);
    assert.deepEqual(all.body.settle_up, [{ from: 'ben', to: 'anna', amount: 10, currency: 'EUR' }, { from: 'me', to: 'anna', amount: 10, currency: 'EUR' }]);
    const one = await call('GET', '/journeys/j1/expenses', { query: { stop: 's1' } });
    assert.deepEqual(one.body.expenses.map((e: any) => e.title), ['Pho']);
    assert.deepEqual(one.body.totals, [{ currency: 'EUR', total: 42 }]);
  });

  test('PATCH keeps what is not sent, scales the split, follows the date', async () => {
    const { body: e } = await call('POST', '/journeys/j1/stops/s1/expenses', { body: { title: 'Dinner', amount: 30, currency: 'EUR', paid_by: 'me', split_among: ['me', 'anna'], notes: 'nice' } });
    const patched = await call('PATCH', `/journeys/j1/expenses/${e.id}`, { body: { amount: 50, date: '2026-11-06' } });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.notes, 'nice');
    assert.deepEqual(patched.body.shares, [{ traveller_id: 'me', amount: 25 }, { traveller_id: 'anna', amount: 25 }]);
    assert.equal(patched.body.stop_id, 's2', 'moved with its day');
    const pinned = await call('PATCH', `/journeys/j1/expenses/${e.id}`, { body: { date: '2026-11-02', stop_id: null } });
    assert.equal(pinned.body.stop_id, null);
    assert.equal((await call('PATCH', `/journeys/j1/expenses/${e.id}`, { body: { paid_by: 'zoe' } })).status, 400);
    assert.equal((await call('PATCH', `/journeys/j1/expenses/${e.id}`, { body: { amount: -1 } })).status, 400);
  });

  test('deleting a journey tombstones its expenses', async () => {
    const { body: e } = await call('POST', '/journeys/j1/expenses', { body: { title: 'Dinner', amount: 30, currency: 'EUR' } });
    assert.equal((await call('DELETE', '/journeys/j1')).status, 200);
    assert.equal(__get(`users/u1/expenses/${e.id}`)!.deleted, true);
  });
});

// ─── The mirror and friends who plan along ───────────────────────────────────

describe('expenses on a shared trip', () => {
  const owned = (extra: Record<string, unknown> = {}) => ({
    journey_id: 'j1', stop_id: 's1', title: 'Dinner', amount: 30, currency: 'EUR', paid_by: 'me',
    shares: [{ traveller_id: 'me', amount: 15 }, { traveller_id: 'anna', amount: 15 }], date: '2026-11-02', category: 'food',
    notes: null, receipt_document_id: null, source: 'manual', local_id: 4,
    updated_at: Timestamp.fromDate(new Date('2026-09-02T10:00:00Z')), synced_at: Timestamp.now(), deleted: false, ...extra,
  });

  async function sharedWithAnna(canEdit = true) {
    __seed('users/owner/journeys/j1', { title: 'Vietnam', legs: LEGS, travellers: TRAVELLERS, updated_at: Timestamp.fromDate(new Date('2026-09-01T10:00:00Z')), deleted: false });
    const { code } = await share('owner', { journeyId: 'j1' });
    await join('anna', { code });
    if (canEdit) await setMemberCanEdit('owner', { journeyId: 'j1', memberUid: 'anna', canEdit: true });
  }

  test('sharing copies the expenses paid before it; later ones follow through the trigger', async () => {
    __seed('users/owner/expenses/e0', owned());
    __seed('users/owner/expenses/e1', owned({ deleted: true }));
    await sharedWithAnna(false);
    assert.deepEqual(Object.keys((__get('shared_journeys/j1') as any).expenses), ['e0']);
    await refreshMirrorExpense('owner', 'e2', owned({ title: 'Taxi' }));
    const entry = (__get('shared_journeys/j1') as any).expenses.e2;
    assert.equal(entry.title, 'Taxi');
    assert.equal(entry.local_id, undefined);
    assert.deepEqual(entry.shares, [{ traveller_id: 'me', amount: 15 }, { traveller_id: 'anna', amount: 15 }]);
    await refreshMirrorExpense('owner', 'e2', owned({ deleted: true }));
    assert.equal((__get('shared_journeys/j1') as any).expenses.e2, undefined);
  });

  const sent = (extra: Record<string, unknown> = {}) => ({
    id: 'exp-1', stop_id: 's1', title: 'Beers', amount: 20, currency: 'EUR', paid_by: 'anna', shares: [{ traveller_id: 'anna', amount: 10 }, { traveller_id: 'me', amount: 10 }],
    date: '2026-11-03', category: 'drinks', updated_at: '2026-09-03T10:00:00Z', deleted: false, ...extra,
  });

  test('a member with the right adds one; without it, or for strangers, refused', async () => {
    await sharedWithAnna(false);
    await rejects(updateSharedExpenseFor('anna', { journeyId: 'j1', expense: sent() }), 'permission-denied');
    await setMemberCanEdit('owner', { journeyId: 'j1', memberUid: 'anna', canEdit: true });
    assert.deepEqual(await updateSharedExpenseFor('anna', { journeyId: 'j1', expense: sent({ junk: 1 }) }), { ok: true, stale: false });
    const own = __get('users/owner/expenses/exp-1')! as any;
    assert.equal(own.title, 'Beers');
    assert.equal(own.paid_by, 'anna');
    assert.equal(own.junk, undefined);
    const entry = (__get('shared_journeys/j1') as any).expenses['exp-1'];
    assert.deepEqual(expenseMirrorEntry('exp-1', own), entry);
    await rejects(updateSharedExpenseFor('anna', { journeyId: 'j1', expense: sent({ paid_by: 'zoe', updated_at: '2026-09-04T10:00:00Z' }) }), 'invalid-argument');
    await rejects(updateSharedExpenseFor('anna', { journeyId: 'j1', expense: sent({ stop_id: 'elsewhere', updated_at: '2026-09-04T10:00:00Z' }) }), 'not-found');
  });

  test('an older edit is stale; deleting leaves the mirror', async () => {
    await sharedWithAnna();
    __seed('users/owner/expenses/exp-1', owned({ updated_at: Timestamp.fromDate(new Date('2026-09-05T10:00:00Z')) }));
    assert.deepEqual(await updateSharedExpenseFor('anna', { journeyId: 'j1', expense: sent() }), { ok: false, stale: true });
    assert.deepEqual(await updateSharedExpenseFor('anna', { journeyId: 'j1', expense: sent({ updated_at: '2026-09-06T10:00:00Z', deleted: true }) }), { ok: true, stale: false });
    assert.equal((__get('users/owner/expenses/exp-1') as any).deleted, true);
    assert.equal((__get('shared_journeys/j1') as any).expenses['exp-1'], undefined);
  });
});
