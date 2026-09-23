import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { Timestamp, __get, __reset, __seed } from './fakeFirestore';
import { activeUntil, checkPro, requireAppCheck, requirePro } from '../src/access';
import { serve } from '../src/agent';

// ─── Harness ─────────────────────────────────────────────────────────────────

const ENT = 'MMM 0 LLC Pro';
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

/** What RevenueCat answers per uid; a number is an HTTP error status. */
let answers: Record<string, unknown> = {};
let lookups: string[] = [];
const realFetch = globalThis.fetch;

function withEntitlement(entitlement: Record<string, unknown> | null) {
  return { subscriber: { entitlements: entitlement ? { [ENT]: entitlement } : {} } };
}

beforeEach(() => {
  __reset();
  answers = {};
  lookups = [];
  process.env.REVENUECAT_SECRET_KEY = 'sk_test';
  process.env.ENTITLEMENT_MODE = 'enforce';
  process.env.APP_CHECK_MODE = 'off';
  globalThis.fetch = (async (url: string, init: { headers: Record<string, string> }) => {
    assert.equal(init.headers.Authorization, 'Bearer sk_test');
    const uid = decodeURIComponent(String(url).split('/').pop()!);
    lookups.push(uid);
    const answer = answers[uid];
    if (answer instanceof Error) throw answer;
    if (typeof answer === 'number') return { ok: false, status: answer, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => answer ?? withEntitlement(null) };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.REVENUECAT_SECRET_KEY;
  delete process.env.ENTITLEMENT_MODE;
  delete process.env.APP_CHECK_MODE;
});

const rejects = async (work: Promise<unknown>, code: string) => {
  await assert.rejects(work, (err: any) => err.code === code, `expected ${code}`);
};

// ─── The entitlement itself ──────────────────────────────────────────────────

describe('reading a RevenueCat entitlement', () => {
  const now = Date.parse('2026-09-23T12:00:00Z');
  test('running subscription, lapsed one, lifetime, grace period, none', () => {
    assert.equal(activeUntil({ expires_date: iso(now + DAY) }, now).active, true);
    assert.equal(activeUntil({ expires_date: iso(now - DAY) }, now).active, false);
    assert.deepEqual(activeUntil({ expires_date: null }, now), { active: true, until: null });
    assert.equal(activeUntil({ expires_date: iso(now - DAY), grace_period_expires_date: iso(now + DAY) }, now).active, true);
    assert.equal(activeUntil(undefined, now).active, false);
  });
});

describe('checking Pro', () => {
  test('a subscriber passes and is cached, so the next call asks nobody', async () => {
    answers.u1 = withEntitlement({ expires_date: iso(Date.now() + 30 * DAY) });
    await requirePro('u1', 'test');
    await requirePro('u1', 'test');
    assert.deepEqual(lookups, ['u1']);
    assert.equal(__get('entitlements/u1')!.pro, true);
  });

  test('an account without Pro is refused in enforce, let through in log', async () => {
    await rejects(requirePro('free', 'test'), 'permission-denied');
    process.env.ENTITLEMENT_MODE = 'log';
    await requirePro('free', 'test');
    process.env.ENTITLEMENT_MODE = 'off';
    lookups = [];
    await requirePro('free', 'test');
    assert.deepEqual(lookups, []);
  });

  test('a lapsed subscription is refused', async () => {
    answers.gone = withEntitlement({ expires_date: iso(Date.now() - DAY) });
    await rejects(requirePro('gone', 'test'), 'permission-denied');
  });

  test('a cached Pro that has since expired is asked again', async () => {
    __seed('entitlements/u1', {
      pro: true,
      checked_at: Timestamp.fromDate(new Date(Date.now() - 60_000)),
      expires_at: Timestamp.fromDate(new Date(Date.now() - 1000)),
    });
    await rejects(requirePro('u1', 'test'), 'permission-denied');
    assert.deepEqual(lookups, ['u1']);
  });

  test('a fresh purchase is seen within a minute of a "no"', async () => {
    __seed('entitlements/buyer', { pro: false, checked_at: Timestamp.fromDate(new Date(Date.now() - 61_000)), expires_at: null });
    answers.buyer = withEntitlement({ expires_date: iso(Date.now() + 30 * DAY) });
    await requirePro('buyer', 'test');
  });

  test('a check that cannot run never locks anyone out', async () => {
    delete process.env.REVENUECAT_SECRET_KEY;
    assert.deepEqual(await checkPro('nokey'), { pro: true, source: 'unchecked' });

    process.env.REVENUECAT_SECRET_KEY = 'sk_test';
    answers.down = 503;
    assert.equal((await checkPro('down')).pro, true);
    answers.net = new Error('socket hang up');
    assert.equal((await checkPro('net')).pro, true);
    // Nothing was cached from a failed lookup.
    assert.equal(__get('entitlements/down'), undefined);
  });

  test('when RevenueCat is down, an older Pro answer still counts', async () => {
    __seed('entitlements/u1', { pro: true, checked_at: Timestamp.fromDate(new Date(Date.now() - 2 * DAY)), expires_at: null });
    answers.u1 = 500;
    assert.deepEqual(await checkPro('u1'), { pro: true, source: 'stale-cache' });
  });
});

// ─── App Check ───────────────────────────────────────────────────────────────

describe('App Check', () => {
  const req = (app?: unknown) => ({ auth: { uid: 'u1' }, app, data: {} }) as any;
  test('off and log let everything through, enforce wants a token', () => {
    requireAppCheck(req(), 'test');
    process.env.APP_CHECK_MODE = 'log';
    requireAppCheck(req(), 'test');
    process.env.APP_CHECK_MODE = 'enforce';
    assert.throws(() => requireAppCheck(req(), 'test'), (err: any) => err.code === 'failed-precondition');
    requireAppCheck(req({ appId: 'ios' }), 'test');
  });
});

// ─── The agent API ───────────────────────────────────────────────────────────

describe('the agent API', () => {
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');
  async function get(token: string) {
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    const reply = { status: 0, body: undefined as any };
    const res: any = {
      status(s: number) { reply.status = s; return res; },
      set() { return res; },
      json(b: unknown) { reply.body = b; },
      send(b: unknown) { reply.body = b; },
    };
    await serve({ method: 'GET', path: '/v1/journeys', query: {}, get: (n: string) => headers[n.toLowerCase()] } as any, res);
    return reply;
  }

  test('a key keeps working only while its account has Pro', async () => {
    __seed(`agent_tokens/${sha('nmd_paid')}`, { uid: 'paid', edit_timeline: false, label: 'a' });
    __seed(`agent_tokens/${sha('nmd_lapsed')}`, { uid: 'lapsed', edit_timeline: false, label: 'b' });
    answers.paid = withEntitlement({ expires_date: iso(Date.now() + 30 * DAY) });
    answers.lapsed = withEntitlement({ expires_date: iso(Date.now() - DAY) });
    assert.equal((await get('nmd_paid')).status, 200);
    const refused = await get('nmd_lapsed');
    assert.equal(refused.status, 403);
  });
});
