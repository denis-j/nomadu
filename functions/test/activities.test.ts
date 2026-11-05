import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { Timestamp, __get, __reset, __seed } from './fakeFirestore';
import { serve } from '../src/agent';
import { activityMirrorEntry, join, refreshMirrorActivity, setMemberCanEdit, share, updateSharedActivityFor } from '../src/share';

process.env.ENTITLEMENT_MODE = 'off';

// ─── Harness ─────────────────────────────────────────────────────────────────

const RW = 'nmd_readwrite';
const OTHER = 'nmd_someoneelse';
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

const rejects = async (work: Promise<unknown>, code: string) => {
  await assert.rejects(work, (err: any) => err.code === code, `expected ${code}`);
};

beforeEach(() => {
  __reset();
  __seed(`agent_tokens/${sha(RW)}`, { uid: 'u1', edit_timeline: false, label: 'rw' });
  __seed(`agent_tokens/${sha(OTHER)}`, { uid: 'u2', edit_timeline: true, label: 'other' });
  __seed('users/u1/journeys/j1', { title: 'Vietnam', legs: LEGS, travellers: [], updated_at: Timestamp.now(), deleted: false });
  __seed('users/u1/journeys/gone', { title: 'Old', legs: LEGS, travellers: [], updated_at: Timestamp.now(), deleted: true });
});

// ─── Agent routes ────────────────────────────────────────────────────────────

describe('activities over the agent API', () => {
  test('an agent adds activities to a stop; they go to the end of its list', async () => {
    const first = await call('POST', '/journeys/j1/stops/s1/activities', { body: { title: 'Egg coffee', category: 'cafe', price: 35000, currency: 'vnd' } });
    assert.equal(first.status, 201);
    assert.match(first.body.id, /^[0-9a-f-]{36}$/);
    assert.equal(first.body.journey_id, 'j1');
    assert.equal(first.body.stop_id, 's1');
    assert.equal(first.body.source, 'agent');
    assert.equal(first.body.status, 'idea');
    assert.equal(first.body.currency, 'VND');
    assert.equal(first.body.sort_order, 0);
    assert.equal(first.body.deleted, undefined);
    assert.ok(first.body.updated_at);
    const second = await call('POST', '/journeys/j1/stops/s1/activities', { body: { title: 'Train street' } });
    assert.equal(second.body.sort_order, 1);
    const elsewhere = await call('POST', '/journeys/j1/stops/s2/activities', { body: { title: 'Marble Mountains' } });
    assert.equal(elsewhere.body.sort_order, 0);

    const stored = __get(`users/u1/activities/${first.body.id}`)!;
    assert.equal(stored.deleted, false);
    assert.ok(stored.synced_at, 'the phone pulls by synced_at');
    assert.ok(stored.updated_at instanceof Timestamp);
  });

  test('a stop that is not on the journey, or a journey that is gone: 404', async () => {
    assert.equal((await call('POST', '/journeys/j1/stops/nope/activities', { body: { title: 'X' } })).status, 404);
    assert.equal((await call('POST', '/journeys/missing/stops/s1/activities', { body: { title: 'X' } })).status, 404);
    assert.equal((await call('GET', '/journeys/gone/activities')).status, 404);
    assert.equal((await call('GET', '/journeys/j1/activities', { token: OTHER })).status, 404);
  });

  test('without a stop it waits to be placed; a stop_id must be one of the journey', async () => {
    const loose = await call('POST', '/journeys/j1/activities', { body: { title: 'Somewhere nice' } });
    assert.equal(loose.status, 201);
    assert.equal(loose.body.stop_id, null);
    const placed = await call('POST', '/journeys/j1/activities', { body: { title: 'Pho', stop_id: 's1' } });
    assert.equal(placed.body.stop_id, 's1');
    assert.equal((await call('POST', '/journeys/j1/activities', { body: { title: 'X', stop_id: 'nope' } })).status, 400);
  });

  test('bad values are refused with the model\'s message', async () => {
    const noTitle = await call('POST', '/journeys/j1/stops/s1/activities', { body: { category: 'food' } });
    assert.equal(noTitle.status, 400);
    assert.equal(noTitle.body.error.code, 'invalid-argument');
    assert.equal((await call('POST', '/journeys/j1/stops/s1/activities', { body: { title: 'X', category: 'party' } })).status, 400);
    assert.equal((await call('POST', '/journeys/j1/stops/s1/activities', { body: { title: 'X', price: 10 } })).status, 400);
    assert.equal((await call('POST', '/journeys/j1/stops/s1/activities', { body: { title: 'X', url: 'javascript:alert(1)' } })).status, 400);
  });

  test('the list is in trip order, filters by stop, and leaves out the deleted', async () => {
    await call('POST', '/journeys/j1/activities', { body: { title: 'Loose' } });
    await call('POST', '/journeys/j1/stops/s2/activities', { body: { title: 'Beach' } });
    await call('POST', '/journeys/j1/stops/s1/activities', { body: { title: 'Pho' } });
    const doomed = await call('POST', '/journeys/j1/stops/s1/activities', { body: { title: 'Doomed' } });
    __seed('users/u1/activities/other', { journey_id: 'j9', stop_id: null, title: 'Other trip', deleted: false });
    assert.equal((await call('DELETE', `/journeys/j1/activities/${doomed.body.id}`)).status, 200);
    assert.equal(__get(`users/u1/activities/${doomed.body.id}`)!.deleted, true);

    const all = await call('GET', '/journeys/j1/activities');
    assert.equal(all.status, 200);
    assert.deepEqual(all.body.activities.map((a: any) => a.title), ['Pho', 'Beach', 'Loose']);
    const one = await call('GET', '/journeys/j1/activities', { query: { stop: 's2' } });
    assert.deepEqual(one.body.activities.map((a: any) => a.title), ['Beach']);
    assert.equal((await call('GET', `/journeys/j1/activities/${doomed.body.id}`)).status, 404);
  });

  test('PATCH changes what is sent, keeps the rest, and moves between stops', async () => {
    const { body: a } = await call('POST', '/journeys/j1/stops/s1/activities', { body: { title: 'Cooking class', notes: 'morning', price: 30, currency: 'USD' } });
    await call('POST', '/journeys/j1/stops/s2/activities', { body: { title: 'Already there' } });
    const patched = await call('PATCH', `/journeys/j1/activities/${a.id}`, { body: { status: 'booked', price: null, stop_id: 's2' } });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.status, 'booked');
    assert.equal(patched.body.notes, 'morning');
    assert.equal(patched.body.price, null);
    assert.equal(patched.body.stop_id, 's2');
    assert.equal(patched.body.sort_order, 1, 'to the end of the new stop');
    const unplaced = await call('PATCH', `/journeys/j1/activities/${a.id}`, { body: { stop_id: null } });
    assert.equal(unplaced.body.stop_id, null);
    assert.equal((await call('PATCH', `/journeys/j1/activities/${a.id}`, { body: { stop_id: 'nope' } })).status, 400);
    assert.equal((await call('PATCH', `/journeys/j1/activities/${a.id}`, { body: { title: '' } })).status, 400);
    assert.equal((await call('GET', `/journeys/j1/activities/${a.id}`)).body.title, 'Cooking class');
  });

  test('an activity of another journey is not reachable through this one', async () => {
    __seed('users/u1/journeys/j2', { title: 'Japan', legs: [], travellers: [], deleted: false });
    const { body: a } = await call('POST', '/journeys/j1/stops/s1/activities', { body: { title: 'Pho' } });
    assert.equal((await call('GET', `/journeys/j2/activities/${a.id}`)).status, 404);
    assert.equal((await call('DELETE', `/journeys/j2/activities/${a.id}`)).status, 404);
    assert.equal((await call('GET', '/journeys/j1/stops/s1/activities')).status, 404, 'listing is per journey');
  });
});

// ─── The mirror and friends who plan along ───────────────────────────────────

describe('activities on a shared trip', () => {
  const owned = (extra: Record<string, unknown> = {}) => ({
    journey_id: 'j1', stop_id: 's1', title: 'Pho', category: 'food', status: 'idea', place: null, address: null,
    latitude: null, longitude: null, url: null, price: null, currency: null, notes: null, source: 'manual',
    source_url: null, image_url: null, sort_order: 0, local_id: 4, updated_at: Timestamp.fromDate(new Date('2026-09-02T10:00:00Z')),
    synced_at: Timestamp.now(), deleted: false, ...extra,
  });

  async function sharedWithAnna(canEdit = true) {
    __seed('users/owner/journeys/j1', { title: 'Vietnam', legs: LEGS, travellers: [], updated_at: Timestamp.fromDate(new Date('2026-09-01T10:00:00Z')), deleted: false });
    const { code } = await share('owner', { journeyId: 'j1' });
    await join('anna', { code });
    if (canEdit) await setMemberCanEdit('owner', { journeyId: 'j1', memberUid: 'anna', canEdit: true });
  }

  test('sharing copies the activities planned before it', async () => {
    __seed('users/owner/activities/a0', owned());
    __seed('users/owner/activities/a1', owned({ deleted: true }));
    __seed('users/owner/activities/a2', owned({ journey_id: 'j2' }));
    await sharedWithAnna(false);
    assert.deepEqual(Object.keys((__get('shared_journeys/j1') as any).activities), ['a0']);
  });

  test('an activity of the owner\'s reaches the mirror, and leaves it when deleted', async () => {
    await sharedWithAnna(false);
    await refreshMirrorActivity('owner', 'a1', owned());
    const entry = (__get('shared_journeys/j1') as any).activities.a1;
    assert.equal(entry.id, 'a1');
    assert.equal(entry.title, 'Pho');
    assert.equal(entry.stop_id, 's1');
    assert.equal(entry.updated_at, '2026-09-02T10:00:00.000Z');
    assert.equal(entry.local_id, undefined);
    assert.equal(entry.synced_at, undefined);
    await refreshMirrorActivity('owner', 'a1', owned({ deleted: true }));
    assert.deepEqual((__get('shared_journeys/j1') as any).activities, {});
  });

  test('not into a trip that is not shared, nor into someone else\'s mirror', async () => {
    await refreshMirrorActivity('owner', 'a1', owned());
    assert.equal(__get('shared_journeys/j1'), undefined);
    await sharedWithAnna(false);
    await refreshMirrorActivity('anna', 'a1', owned());
    assert.deepEqual((__get('shared_journeys/j1') as any).activities, {});
  });

  const sent = (extra: Record<string, unknown> = {}) => ({
    id: 'act-1', stop_id: 's1', title: 'Night market', category: 'food', status: 'idea', sort_order: 2,
    updated_at: '2026-09-03T10:00:00Z', deleted: false, ...extra,
  });

  test('a member needs the right', async () => {
    await sharedWithAnna(false);
    await rejects(updateSharedActivityFor('anna', { journeyId: 'j1', activity: sent() }), 'permission-denied');
    await rejects(updateSharedActivityFor('bob', { journeyId: 'j1', activity: sent() }), 'permission-denied');
  });

  test('a member with the right adds one to the owner\'s trip and the mirror', async () => {
    await sharedWithAnna();
    assert.deepEqual(await updateSharedActivityFor('anna', { journeyId: 'j1', activity: sent({ junk: 1 }) }), { ok: true, stale: false });
    const own = __get('users/owner/activities/act-1')! as any;
    assert.equal(own.journey_id, 'j1');
    assert.equal(own.stop_id, 's1');
    assert.equal(own.title, 'Night market');
    assert.equal(own.sort_order, 2);
    assert.equal(own.junk, undefined);
    assert.ok(own.synced_at);
    assert.equal(own.updated_at.toDate().toISOString(), '2026-09-03T10:00:00.000Z');
    const entry = (__get('shared_journeys/j1') as any).activities['act-1'];
    assert.equal(entry.title, 'Night market');
    assert.equal(entry.updated_at, '2026-09-03T10:00:00.000Z');
    // The owner's trigger then finds nothing to change.
    assert.deepEqual(activityMirrorEntry('act-1', own), entry);
  });

  test('stops, ids and fields are checked', async () => {
    await sharedWithAnna();
    await rejects(updateSharedActivityFor('anna', { journeyId: 'j1', activity: sent({ stop_id: 'elsewhere' }) }), 'not-found');
    await rejects(updateSharedActivityFor('anna', { journeyId: 'j1', activity: sent({ id: '../x' }) }), 'invalid-argument');
    await rejects(updateSharedActivityFor('anna', { journeyId: 'j1', activity: sent({ title: '' }) }), 'invalid-argument');
    await rejects(updateSharedActivityFor('anna', { journeyId: 'j1', activity: sent({ updated_at: 'whenever' }) }), 'invalid-argument');
    assert.deepEqual(await updateSharedActivityFor('anna', { journeyId: 'j1', activity: sent({ stop_id: null }) }), { ok: true, stale: false });
    assert.equal((__get('users/owner/activities/act-1') as any).stop_id, null);
  });

  test('an older edit of the same activity is stale; a newer one wins; deleting leaves the mirror', async () => {
    await sharedWithAnna();
    __seed('users/owner/activities/act-1', owned({ updated_at: Timestamp.fromDate(new Date('2026-09-05T10:00:00Z')) }));
    assert.deepEqual(await updateSharedActivityFor('anna', { journeyId: 'j1', activity: sent() }), { ok: false, stale: true });
    assert.equal((__get('users/owner/activities/act-1') as any).title, 'Pho');
    assert.deepEqual(await updateSharedActivityFor('anna', { journeyId: 'j1', activity: sent({ updated_at: '2026-09-06T10:00:00Z' }) }), { ok: true, stale: false });
    assert.equal((__get('users/owner/activities/act-1') as any).title, 'Night market');
    await updateSharedActivityFor('anna', { journeyId: 'j1', activity: sent({ updated_at: '2026-09-07T10:00:00Z', deleted: true }) });
    assert.equal((__get('users/owner/activities/act-1') as any).deleted, true);
    assert.equal((__get('shared_journeys/j1') as any).activities['act-1'], undefined);
  });

  test('an id from another of the owner\'s trips is refused', async () => {
    await sharedWithAnna();
    __seed('users/owner/activities/act-1', owned({ journey_id: 'j2', updated_at: Timestamp.fromDate(new Date('2026-01-01T00:00:00Z')) }));
    await rejects(updateSharedActivityFor('anna', { journeyId: 'j1', activity: sent() }), 'permission-denied');
    assert.equal((__get('users/owner/activities/act-1') as any).journey_id, 'j2');
  });
});
