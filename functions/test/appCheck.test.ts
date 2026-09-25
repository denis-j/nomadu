import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { startAppCheck } from '../../lib/appCheck';
import { appCheckFakes as fakes } from './fakeAppCheck';

// The app as lib/firebase.ts hands it over.
const app = { options: { projectId: 'nomady-dcff6', appId: '1:1044287572548:ios:abc', apiKey: 'AIza-test' } } as any;

/**
 * Firebase's App Check REST API as far as the provider uses it. It hands out
 * each challenge once and checks that what comes back was signed over the
 * challenge it issued, like the real service does with Apple's data.
 */
const server = {
  requests: [] as { method: string; url: string; headers: Record<string, string>; body: any }[],
  issued: new Set<string>(),
  challenges: 0,
  refuseAssertion: false,
  registeredDebugTokens: new Set<string>(),
  reset() {
    this.requests.length = 0;
    this.issued.clear();
    this.challenges = 0;
    this.refuseAssertion = false;
    this.registeredDebugTokens.clear();
  },
};

const reply = (status: number, body: object) =>
  ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

function useChallenge(challenge: string): boolean {
  if (!server.issued.has(challenge)) return false;
  server.issued.delete(challenge);
  return true;
}

globalThis.fetch = (async (url: string, init: RequestInit) => {
  const method = url.split(':').pop()!;
  const body = JSON.parse(String(init.body));
  server.requests.push({ method, url, headers: init.headers as Record<string, string>, body });
  switch (method) {
    case 'generateAppAttestChallenge': {
      const challenge = `ch${++server.challenges}`;
      server.issued.add(challenge);
      return reply(200, { challenge, ttl: '300s' });
    }
    case 'exchangeAppAttestAttestation':
      if (!useChallenge(body.challenge)) return reply(403, { error: 'stale challenge' });
      if (body.attestationStatement !== `attestation(${body.keyId},${body.challenge})`) return reply(403, { error: 'bad attestation' });
      return reply(200, { artifact: `art-${body.keyId}`, appCheckToken: { token: `att-token-${body.keyId}`, ttl: '3600s' } });
    case 'exchangeAppAttestAssertion': {
      if (!useChallenge(body.challenge) || server.refuseAssertion) return reply(403, { error: 'App attestation failed.' });
      const keyId = String(body.artifact).replace(/^art-/, '');
      if (body.assertion !== `assertion(${keyId},${body.artifact},${body.challenge})`) return reply(403, { error: 'bad assertion' });
      return reply(200, { token: `assert-token-${keyId}`, ttl: '1800.5s' });
    }
    case 'exchangeDebugToken':
      if (!server.registeredDebugTokens.has(body.debugToken)) return reply(403, { error: 'App attestation failed.' });
      return reply(200, { token: `debug-token-${body.debugToken}`, ttl: '3600s' });
    default:
      return reply(404, { error: 'no such method' });
  }
}) as typeof fetch;

const g = globalThis as any;
function start(dev: boolean) {
  g.__DEV__ = dev;
  startAppCheck(app);
  return fakes.initialized[0];
}

beforeEach(() => {
  fakes.reset();
  server.reset();
  delete process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN;
});

describe('a release build on an iPhone with App Attest', () => {
  test('the first token attests a new key and keeps key and artifact in the keychain', async () => {
    const before = Date.now();
    const token = await start(false).getToken();
    assert.equal(token.token, 'att-token-key1');
    assert.ok(token.expireTimeMillis >= before + 3600_000 && token.expireTimeMillis <= Date.now() + 3600_000);
    assert.deepEqual(fakes.calls.map((c) => c.name), ['generateKey', 'attestKey']);
    assert.deepEqual(fakes.calls[1].args, ['key1', 'ch1']);
    assert.equal(fakes.keychain.get('appcheck_attest_key'), 'key1');
    assert.equal(fakes.keychain.get('appcheck_attest_artifact'), 'art-key1');
  });

  test('later tokens are assertions with the same key, signed over artifact and a fresh challenge', async () => {
    const provider = start(false);
    await provider.getToken();
    fakes.calls.length = 0;
    const second = await provider.getToken();
    const third = await provider.getToken();
    assert.equal(second.token, 'assert-token-key1');
    assert.equal(third.token, 'assert-token-key1');
    assert.deepEqual(fakes.calls.map((c) => c.name), ['assert', 'assert']);
    assert.deepEqual(fakes.calls[0].args, ['key1', 'art-key1', 'ch2']);
    assert.deepEqual(fakes.calls[1].args, ['key1', 'art-key1', 'ch3']);
    assert.equal(fakes.attest.keys, 1, 'no new key per token');
  });

  test('fractional ttl from the API ("1800.5s") becomes the expiry', async () => {
    const provider = start(false);
    await provider.getToken();
    const before = Date.now();
    const token = await provider.getToken();
    assert.ok(Math.abs(token.expireTimeMillis - (before + 1800_500)) < 1000);
  });

  test('a key App Attest no longer knows (restored onto another phone) is replaced by a new attestation', async () => {
    fakes.keychain.set('appcheck_attest_key', 'lostkey');
    fakes.keychain.set('appcheck_attest_artifact', 'art-lostkey');
    const token = await start(false).getToken();
    assert.equal(token.token, 'att-token-key1');
    assert.equal(fakes.keychain.get('appcheck_attest_key'), 'key1');
    assert.equal(fakes.errors.length, 1);
    assert.equal(fakes.errors[0].where, 'appcheck:assertion');
  });

  test('an artifact the server refuses leads to one new attestation', async () => {
    const provider = start(false);
    await provider.getToken();
    server.refuseAssertion = true;
    const token = await provider.getToken();
    assert.equal(token.token, 'att-token-key2');
    assert.equal(fakes.keychain.get('appcheck_attest_artifact'), 'art-key2');
  });

  test('every request names the project, the iOS app, the API key and the bundle', async () => {
    await start(false).getToken();
    for (const r of server.requests) {
      assert.match(r.url, /^https:\/\/content-firebaseappcheck\.googleapis\.com\/v1\/projects\/nomady-dcff6\/apps\/1:1044287572548:ios:abc:/);
      assert.equal(r.headers['X-Goog-Api-Key'], 'AIza-test');
      assert.equal(r.headers['X-Ios-Bundle-Identifier'], 'com.nomady.app');
    }
    assert.deepEqual(server.requests.map((r) => r.method), ['generateAppAttestChallenge', 'exchangeAppAttestAttestation']);
  });
});

describe('a release build without App Attest', () => {
  test('sends no token at all, and never falls back to a debug token', () => {
    fakes.attest.isSupported = false;
    process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN = 'shared-debug';
    start(false);
    assert.equal(fakes.initialized.length, 0);
    assert.equal(server.requests.length, 0);
  });
});

describe('development (simulator, dev builds)', () => {
  test('uses the shared debug token from .env.local and never App Attest', async () => {
    process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN = 'shared-debug';
    server.registeredDebugTokens.add('shared-debug');
    const token = await start(true).getToken();
    assert.equal(token.token, 'debug-token-shared-debug');
    assert.equal(fakes.calls.length, 0);
    assert.deepEqual(server.requests.map((r) => r.method), ['exchangeDebugToken']);
  });

  test('without one in .env.local, makes one per device and keeps it', async () => {
    const provider = start(true);
    await assert.rejects(provider.getToken(), /403/);
    const made = fakes.keychain.get('appcheck_debug_token');
    assert.ok(made && /^[0-9a-f-]{36}$/.test(made));
    server.registeredDebugTokens.add(made!);
    assert.equal((await provider.getToken()).token, `debug-token-${made}`);
  });

  test('an unregistered debug token fails the token, not the app', async () => {
    process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN = 'not-registered';
    await assert.rejects(start(true).getToken(), /App Check exchangeDebugToken: 403/);
  });
});
