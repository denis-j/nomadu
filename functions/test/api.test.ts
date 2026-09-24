import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { Timestamp, __get, __reset, __seed } from './fakeFirestore';
import { serve } from '../src/agent';

// Pro and App Check have their own tests (access.test.ts); here every key's
// account counts as paying.
process.env.ENTITLEMENT_MODE = 'off';

// ─── Harness ─────────────────────────────────────────────────────────────────

const RW = 'nmd_readwrite';
const RO = 'nmd_readonly';
const OTHER = 'nmd_someoneelse';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

interface Reply {
  status: number;
  body: any;
}

async function call(method: string, path: string, { token = RW, body, query = {} }: { token?: string | null; body?: unknown; query?: Record<string, string> } = {}): Promise<Reply> {
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  const req: any = { method, path: `/v1${path}`, query, body, get: (name: string) => headers[name.toLowerCase()] };
  const reply: Reply = { status: 0, body: undefined };
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
  { sync_id: 's1', city: 'Hanoi', country: 'Vietnam', country_code: 'VN', latitude: 21, longitude: 105, start_date: '2026-11-01', end_date: '2026-11-04', transport: 'flight', notes: null, sort_order: 0 },
  { sync_id: 's2', city: 'Da Nang', country: 'Vietnam', country_code: 'VN', latitude: 16, longitude: 108, start_date: '2026-11-05', end_date: '2026-11-07', transport: 'train', notes: null, sort_order: 1 },
];

const ACC = '/journeys/j1/stops/s1/accommodation';

beforeEach(() => {
  __reset();
  __seed(`agent_tokens/${sha(RW)}`, { uid: 'u1', edit_timeline: true, label: 'rw' });
  __seed(`agent_tokens/${sha(RO)}`, { uid: 'u1', edit_timeline: false, label: 'ro' });
  __seed(`agent_tokens/${sha(OTHER)}`, { uid: 'u2', edit_timeline: true, label: 'other' });
  __seed('users/u1', { citizenship: { country: 'Germany', countryCode: 'DE' }, hasFixedResidence: false });
  __seed('users/u1/journeys/j1', {
    title: 'Vietnam',
    legs: LEGS,
    travellers: [{ sync_id: 't1', name: 'You', sort_order: 0 }],
    local_id: 7,
    updated_at: Timestamp.fromDate(new Date('2026-09-01T10:00:00Z')),
    deleted: false,
  });
});

// ─── Authentication and isolation ────────────────────────────────────────────

describe('authentication', () => {
  test('no token, wrong token, revoked token: 401', async () => {
    assert.equal((await call('GET', ACC, { token: null })).status, 401);
    assert.equal((await call('GET', ACC, { token: 'nmd_nope' })).status, 401);
    assert.equal((await call('GET', '/accommodations', { token: 'Basic xyz' })).status, 401);
  });

  test("another user's journey is not there", async () => {
    await call('PUT', ACC, { body: {} });
    assert.equal((await call('GET', ACC, { token: OTHER })).status, 404);
    assert.equal((await call('PUT', ACC, { token: OTHER, body: { notes: 'mine now' } })).status, 404);
    assert.equal((await call('GET', '/accommodations', { token: OTHER })).body.accommodations.length, 0);
    // And nothing of theirs was written into u2's space.
    assert.equal(__get('users/u2/accommodations/s1'), undefined);
  });
});

describe('permissions', () => {
  test('a read-only token may plan accommodation, like it may plan journeys', async () => {
    const created = await call('PUT', ACC, { token: RO, body: { requirements: { type: 'hotel' } } });
    assert.equal(created.status, 201);
    const option = await call('POST', `${ACC}/options`, { token: RO, body: { name: 'Hotel A' } });
    assert.equal(option.status, 201);
    const booked = await call('PUT', `${ACC}/booking`, { token: RO, body: { booking_reference: 'R1' } });
    assert.equal(booked.status, 200);
  });

  test('the timeline guard is untouched: a read-only token still cannot write stays', async () => {
    const r = await call('POST', '/trips', { token: RO, body: { city: 'Hanoi', country: 'Vietnam', start_date: '2026-01-01', end_date: '2026-01-03' } });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'forbidden');
    const ok = await call('POST', '/trips', { token: RW, body: { city: 'Hanoi', country: 'Vietnam', start_date: '2026-01-01', end_date: '2026-01-03' } });
    assert.equal(ok.status, 201);
  });
});

// ─── The plan itself ─────────────────────────────────────────────────────────

describe('plan', () => {
  test('nothing planned yet is a 404 that says so', async () => {
    const r = await call('GET', ACC);
    assert.equal(r.status, 404);
    assert.match(r.body.error.message, /PUT one first/);
  });

  test('PUT creates a plan from the stop, then updates it in place', async () => {
    const created = await call('PUT', ACC, { body: { requirements: { type: 'apartment', budget_per_night: 35, currency: 'EUR', amenities: ['wifi', 'desk'] } } });
    assert.equal(created.status, 201);
    assert.equal(created.body.id, 's1');
    assert.equal(created.body.status, 'open');
    assert.equal(created.body.needed, true);
    assert.equal(created.body.check_in, '2026-11-01');
    assert.equal(created.body.check_out, '2026-11-05');
    assert.equal(created.body.nights, 4);
    assert.equal(created.body.dates_match_stop, true);
    assert.deepEqual(created.body.stop, { id: 's1', city: 'Hanoi', country: 'Vietnam', country_code: 'VN', start_date: '2026-11-01', end_date: '2026-11-04' });
    assert.equal(created.body.journey_title, 'Vietnam');
    assert.equal(created.body.requirements.type, 'apartment');

    const stored = __get('users/u1/accommodations/s1')!;
    assert.equal(stored.created_by, 'agent');
    assert.equal(stored.deleted, false);
    assert.ok(stored.updated_at instanceof Timestamp);

    const updated = await call('PATCH', ACC, { body: { notes: 'near the lake', requirements: { work_requirements: 'stable wifi, quiet' } } });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.notes, 'near the lake');
    assert.equal(updated.body.requirements.type, 'apartment');
    assert.equal(updated.body.requirements.budget_per_night, 35);
    assert.equal(updated.body.requirements.work_requirements, 'stable wifi, quiet');
  });

  test('dates are checked, never guessed', async () => {
    const bad = await call('PUT', ACC, { body: { check_in: '2026-02-30' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'invalid-argument');
    const swapped = await call('PUT', ACC, { body: { check_in: '2026-11-05', check_out: '2026-11-01' } });
    assert.equal(swapped.status, 400);
    const longer = await call('PUT', ACC, { body: { check_out: '2026-11-06' } });
    assert.equal(longer.status, 201);
    assert.equal(longer.body.nights, 5);
    assert.equal(longer.body.dates_match_stop, false);
  });

  test('money always comes with a currency', async () => {
    const r = await call('PUT', ACC, { body: { requirements: { budget_total: 500 } } });
    assert.equal(r.status, 400);
    assert.match(r.body.error.message, /currency/);
  });

  test('unknown stop or journey: 404', async () => {
    assert.equal((await call('GET', '/journeys/j1/stops/nope/accommodation')).status, 404);
    assert.equal((await call('PUT', '/journeys/nope/stops/s1/accommodation', { body: {} })).status, 404);
    assert.equal((await call('GET', `${ACC}/something`)).status, 404);
  });

  test('DELETE tombstones: gone from GET and the list, still in the store for the sync', async () => {
    await call('PUT', ACC, { body: {} });
    assert.equal((await call('DELETE', ACC)).status, 200);
    assert.equal((await call('GET', ACC)).status, 404);
    assert.equal((await call('GET', '/accommodations')).body.accommodations.length, 0);
    assert.equal(__get('users/u1/accommodations/s1')!.deleted, true);
    // A new PUT revives it.
    assert.equal((await call('PUT', ACC, { body: {} })).status, 201);
  });
});

// ─── Options ─────────────────────────────────────────────────────────────────

describe('options', () => {
  test('POST saves a found place and creates the plan if there is none', async () => {
    const r = await call('POST', `${ACC}/options`, {
      body: { name: 'Loft in Tay Ho', platform: 'Airbnb', url: 'https://www.airbnb.com/rooms/1', total_price: 420, currency: 'USD', rating: 4.9, review_count: 88, amenities: ['Wifi', 'Desk', 'AC'], score: 8.5, last_checked_at: '2026-09-18T10:00:00Z' },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.status, 'options_available');
    assert.equal(r.body.options.length, 1);
    const o = r.body.options[0];
    assert.ok(o.id);
    assert.equal(o.check_in, '2026-11-01');
    assert.equal(o.check_out, '2026-11-05');
    assert.equal(o.currency, 'USD');
    assert.deepEqual(o.amenities, ['wifi', 'desk', 'ac']);
    assert.equal(o.last_checked_at, '2026-09-18T10:00:00.000Z');
  });

  test('bad values are refused with the field named', async () => {
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ platform: 'Airbnb' }, /name/],
      [{ name: 'A', total_price: 100 }, /currency/],
      [{ name: 'A', rating: 8.7 }, /rating_scale: 10/],
      [{ name: 'A', url: 'javascript:alert(1)' }, /url/],
      [{ name: 'A', notes: 'card 4111 1111 1111 1111' }, /payment card/],
      [{ name: 'A', check_in: '2026-11-03', check_out: '2026-11-03' }, /check_out/],
    ];
    for (const [body, message] of cases) {
      const r = await call('POST', `${ACC}/options`, { body });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.match(r.body.error.message, message);
    }
  });

  test('PATCH changes only what is sent, DELETE removes, unknown ids are 404', async () => {
    const a = (await call('POST', `${ACC}/options`, { body: { name: 'A', total_price: 400, currency: 'USD', notes: 'old' } })).body.options[0];
    const patched = await call('PATCH', `${ACC}/options/${a.id}`, { body: { total_price: 380, last_checked_at: '2026-09-19T08:00:00Z' } });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.options[0].total_price, 380);
    assert.equal(patched.body.options[0].notes, 'old');
    assert.equal((await call('PATCH', `${ACC}/options/nope`, { body: { name: 'x' } })).status, 404);
    const removed = await call('DELETE', `${ACC}/options/${a.id}`);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.options.length, 0);
    assert.equal((await call('DELETE', `${ACC}/options/${a.id}`)).status, 404);
  });

  test('selecting marks the pick and the plan', async () => {
    const a = (await call('POST', `${ACC}/options`, { body: { name: 'A' } })).body.options[0];
    const r = await call('POST', `${ACC}/options/${a.id}/select`);
    assert.equal(r.status, 200);
    assert.equal(r.body.selected_option_id, a.id);
    assert.equal(r.body.status, 'selected');
    assert.equal((await call('POST', `${ACC}/options/nope/select`)).status, 404);
  });
});

// ─── Booking, status, notes ──────────────────────────────────────────────────

describe('booking', () => {
  test('saves the details, links the selected option, marks the plan booked', async () => {
    const a = (await call('POST', `${ACC}/options`, { body: { name: 'A' } })).body.options[0];
    await call('POST', `${ACC}/options/${a.id}/select`);
    const r = await call('PUT', `${ACC}/booking`, {
      body: { booking_reference: 'HX-2231', booking_url: 'https://www.booking.com/x', price: 380, currency: 'USD', deposit: 100, check_in_info: 'Code 4412 at the door' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'booked');
    assert.equal(r.body.booking.option_id, a.id);
    assert.equal(r.body.booking.deposit_currency, 'USD');
    assert.equal(r.body.booking.check_in_info, 'Code 4412 at the door');

    const again = await call('PATCH', `${ACC}/booking`, { body: { provider_contact: '+84 90 000 0000' } });
    assert.equal(again.body.booking.booking_reference, 'HX-2231');
    assert.equal(again.body.booking.provider_contact, '+84 90 000 0000');

    const cleared = await call('DELETE', `${ACC}/booking`);
    assert.equal(cleared.body.booking, null);
    assert.equal(cleared.body.status, 'selected');
  });

  test('refuses what it must not store', async () => {
    await call('PUT', ACC, { body: {} });
    assert.equal((await call('PUT', `${ACC}/booking`, { body: { price: 10 } })).status, 400);
    const card = await call('PUT', `${ACC}/booking`, { body: { notes: 'paid with 5500 0000 0000 0004' } });
    assert.equal(card.status, 400);
    assert.match(card.body.error.message, /payment card/);
    assert.equal((await call('PUT', `${ACC}/booking`, { body: { option_id: 'nope' } })).status, 404);
    // Fields outside the model are dropped, not stored.
    const r = await call('PUT', `${ACC}/booking`, { body: { booking_reference: 'X', password: 'hunter2', card_number: '1' } });
    assert.equal(r.status, 200);
    assert.equal('password' in r.body.booking, false);
    assert.equal('password' in (__get('users/u1/accommodations/s1')!.booking as any), false);
  });
});

describe('status and notes', () => {
  test('status is set explicitly and validated', async () => {
    await call('PUT', ACC, { body: {} });
    const r = await call('PUT', `${ACC}/status`, { body: { status: 'searching' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'searching');
    assert.equal((await call('PUT', `${ACC}/status`, { body: { status: 'lost' } })).status, 400);
    assert.equal((await call('PUT', `${ACC}/status`, { body: {} })).status, 400);
    // Cancelled sticks through automatic moves.
    await call('PUT', `${ACC}/status`, { body: { status: 'cancelled' } });
    assert.equal((await call('POST', `${ACC}/options`, { body: { name: 'A' } })).body.status, 'cancelled');
  });

  test('notes are read in one place and written in one', async () => {
    await call('PUT', ACC, { body: { requirements: { notes: 'ground floor please' } } });
    await call('POST', `${ACC}/options`, { body: { name: 'A', risks: 'construction next door', notes: 'host replies fast' } });
    await call('PUT', `${ACC}/notes`, { body: { notes: 'ask about late check-in' } });
    const r = await call('GET', `${ACC}/notes`);
    assert.equal(r.status, 200);
    assert.equal(r.body.notes, 'ask about late check-in');
    assert.equal(r.body.requirements_notes, 'ground floor please');
    assert.equal(r.body.options[0].risks, 'construction next door');
    assert.equal(r.body.booking_notes, null);
  });
});

// ─── Living next to journeys ─────────────────────────────────────────────────

describe('journeys and the list', () => {
  test('every stop carries a summary of its plan', async () => {
    await call('POST', `${ACC}/options`, { body: { name: 'Loft' } });
    const j = await call('GET', '/journeys/j1');
    assert.equal(j.status, 200);
    assert.deepEqual(j.body.stops[0].accommodation, { status: 'options_available', needed: true, check_in: '2026-11-01', check_out: '2026-11-05', nights: 4, options: 1, selected: null, booked: false });
    assert.equal(j.body.stops[1].accommodation, null);
    const all = await call('GET', '/journeys');
    assert.equal(all.body.journeys[0].stops[0].accommodation.options, 1);
  });

  test('replacing the stops keeps the plan of a stop that kept its id', async () => {
    await call('PUT', ACC, { body: { requirements: { type: 'hotel' } } });
    const r = await call('PATCH', '/journeys/j1', {
      body: { stops: [{ city: 'Hanoi', country: 'Vietnam', start_date: '2026-11-02', days: 5 }, { city: 'Hue', country: 'Vietnam', days: 2 }] },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.stops[0].id, 's1');
    assert.equal(r.body.stops[0].accommodation.status, 'open');
    // The stop moved; the plan kept its dates and says so.
    const plan = await call('GET', ACC);
    assert.equal(plan.body.check_in, '2026-11-01');
    assert.equal(plan.body.dates_match_stop, false);
  });

  test('a dropped stop takes its plan with it, as a tombstone that keeps its fields', async () => {
    await call('PUT', ACC, { body: { requirements: { type: 'hotel' } } });
    await call('PATCH', '/journeys/j1', { body: { stops: [{ city: 'Hue', country: 'Vietnam', start_date: '2026-11-01', days: 3 }] } });
    const stored = __get('users/u1/accommodations/s1')!;
    assert.equal(stored.deleted, true);
    assert.equal((stored.requirements as any).type, 'hotel');
    assert.equal((await call('GET', '/accommodations')).body.accommodations.length, 0);
    assert.equal((await call('GET', ACC)).status, 404);
  });

  test('a stop keeps its id and plan under the spelling the dataset uses, and twins do not share one', async () => {
    await call('PUT', ACC, { body: {} });
    const r = await call('PATCH', '/journeys/j1', {
      // "Anoi" is one of the dataset's aliases for Hanoi.
      body: { stops: [{ city: 'Anoi', country: 'Vietnam', start_date: '2026-11-01', days: 3 }, { city: 'Hanoi', country: 'Vietnam', days: 2 }] },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.stops[0].id, 's1');
    assert.notEqual(r.body.stops[1].id, 's1');
    assert.equal(r.body.stops[0].accommodation.status, 'open');
    assert.equal(r.body.stops[1].accommodation, null);
  });

  test('deleting the journey tombstones its plans', async () => {
    await call('PUT', ACC, { body: {} });
    assert.equal((await call('DELETE', '/journeys/j1')).status, 200);
    assert.equal(__get('users/u1/accommodations/s1')!.deleted, true);
    assert.equal((await call('GET', '/accommodations')).body.accommodations.length, 0);
  });

  test('the list joins plans with their stops and filters', async () => {
    await call('PUT', ACC, { body: {} });
    await call('PUT', '/journeys/j1/stops/s2/accommodation', { body: { status: 'searching' } });
    const all = await call('GET', '/accommodations');
    assert.equal(all.status, 200);
    assert.deepEqual(all.body.accommodations.map((a: any) => a.stop.city), ['Hanoi', 'Da Nang']);
    assert.equal(all.body.accommodations[0].journey_title, 'Vietnam');
    const searching = await call('GET', '/accommodations', { query: { status: 'searching' } });
    assert.deepEqual(searching.body.accommodations.map((a: any) => a.stop_id), ['s2']);
    assert.equal((await call('GET', '/accommodations', { query: { status: 'lost' } })).status, 400);
    assert.equal((await call('GET', '/accommodations', { query: { journey_id: 'other' } })).body.accommodations.length, 0);
  });

  test('accommodation writes never touch the journey, the timeline or the profile', async () => {
    const journeyBefore = JSON.stringify(__get('users/u1/journeys/j1'));
    const profileBefore = JSON.stringify(__get('users/u1'));
    await call('PUT', ACC, { body: { requirements: { type: 'hotel', budget_per_night: 50, currency: 'USD' } } });
    const a = (await call('POST', `${ACC}/options`, { body: { name: 'A', total_price: 200, currency: 'USD' } })).body.options[0];
    await call('POST', `${ACC}/options/${a.id}/select`);
    await call('PUT', `${ACC}/booking`, { body: { booking_reference: 'R', price: 200, currency: 'USD' } });
    await call('PUT', `${ACC}/status`, { body: { status: 'checked_in' } });
    assert.equal(JSON.stringify(__get('users/u1/journeys/j1')), journeyBefore);
    assert.equal(JSON.stringify(__get('users/u1')), profileBefore);
    assert.equal((await call('GET', '/trips')).body.trips.length, 0);
  });
});

describe('the user\'s today', () => {
  test('follows the profile timezone, not the server clock', async () => {
    const { userToday } = await import('../src/agent');
    // 23:30 UTC on 1 March: already 2 March in Bangkok, still 1 March in New York.
    const now = new Date(Date.UTC(2026, 2, 1, 23, 30));
    const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    assert.equal(ymd(userToday('Asia/Bangkok', now)), '2026-3-2');
    assert.equal(ymd(userToday('America/New_York', now)), '2026-3-1');
    assert.equal(ymd(userToday('Not/AZone', now)), ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate())));
  });
});
