import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { FirebaseApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';
import AppAttest from '../modules/app-attest';
import { reportError } from './monitoring';

/**
 * Firebase App Check: every call to the Cloud Functions (and to Firestore
 * and Storage) carries a token that says it comes from this app on a real
 * iPhone, not from a script that lifted the public Firebase config.
 *
 * On a device the proof is Apple's App Attest. A key in the Secure Enclave
 * is attested once, which gives an artifact; after that each new token is
 * an assertion signed with that key. Both are exchanged for an App Check
 * token through Firebase's REST API, the same calls the native Firebase SDK
 * makes (the app uses the JS SDK, which has no App Attest of its own).
 *
 * In development (simulator, dev builds) there is no App Attest: a debug
 * token is created once, logged, and has to be registered in the Firebase
 * console (App Check, Apps, Manage debug tokens) before the server accepts
 * it. Whether the server insists at all is APP_CHECK_MODE in
 * functions/src/access.ts: off, log, then enforce.
 */

const KEY_ID = 'appcheck_attest_key';
const ARTIFACT = 'appcheck_attest_artifact';
const DEBUG_TOKEN = 'appcheck_debug_token';
const STORE_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

interface Token {
  token: string;
  expireTimeMillis: number;
}

function endpoint(app: FirebaseApp, method: string): string {
  const { projectId, appId } = app.options;
  return `https://content-firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${appId}:${method}`;
}

async function call<T>(app: FirebaseApp, method: string, body: object): Promise<T> {
  const response = await fetch(endpoint(app, method), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': app.options.apiKey ?? '',
      'X-Ios-Bundle-Identifier': 'com.nomady.app',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`App Check ${method}: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

/** "3600s" or "3600.5s" from the API into an expiry time. */
function toToken(raw: { token: string; ttl: string }): Token {
  const seconds = parseFloat(raw.ttl) || 3600;
  return { token: raw.token, expireTimeMillis: Date.now() + seconds * 1000 };
}

async function challenge(app: FirebaseApp): Promise<string> {
  return (await call<{ challenge: string }>(app, 'generateAppAttestChallenge', {})).challenge;
}

/** Attest a new key once; the artifact is what later assertions prove. */
async function attest(app: FirebaseApp, attest: NonNullable<typeof AppAttest>): Promise<Token> {
  const keyId = await attest.generateKeyAsync();
  const nonce = await challenge(app);
  const attestationStatement = await attest.attestKeyAsync(keyId, nonce);
  const result = await call<{ artifact: string; appCheckToken: { token: string; ttl: string } }>(
    app,
    'exchangeAppAttestAttestation',
    { attestationStatement, challenge: nonce, keyId },
  );
  await SecureStore.setItemAsync(KEY_ID, keyId, STORE_OPTIONS);
  await SecureStore.setItemAsync(ARTIFACT, result.artifact, STORE_OPTIONS);
  return toToken(result.appCheckToken);
}

async function appAttestToken(app: FirebaseApp, attestService: NonNullable<typeof AppAttest>): Promise<Token> {
  const [keyId, artifact] = await Promise.all([SecureStore.getItemAsync(KEY_ID), SecureStore.getItemAsync(ARTIFACT)]);
  if (!keyId || !artifact) return attest(app, attestService);
  try {
    const nonce = await challenge(app);
    const assertion = await attestService.generateAssertionAsync(keyId, artifact, nonce);
    return toToken(await call(app, 'exchangeAppAttestAssertion', { artifact, assertion, challenge: nonce }));
  } catch (err) {
    // The key can be gone (the app was restored onto another phone, the
    // Secure Enclave was reset) or the artifact refused: start over once.
    reportError(err, 'appcheck:assertion');
    return attest(app, attestService);
  }
}

/**
 * The debug token: one shared token from .env.local (EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN),
 * registered once in the console, so every simulator and dev build works
 * without registering each. Without it, one is made up per device and
 * logged for registering.
 */
async function debugToken(app: FirebaseApp): Promise<Token> {
  let token = process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN || (await SecureStore.getItemAsync(DEBUG_TOKEN));
  if (!token) {
    token = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEBUG_TOKEN, token, STORE_OPTIONS);
    console.log(`[AppCheck] debug token, register it in the Firebase console (App Check, Manage debug tokens): ${token}`);
  }
  return toToken(await call(app, 'exchangeDebugToken', { debugToken: token }));
}

export function startAppCheck(app: FirebaseApp): void {
  const attestService = AppAttest?.isSupported ? AppAttest : null;
  // A release build without App Attest (an old device, or a build made
  // before the module existed) sends no token rather than a debug one: a
  // debug token is a key to the backend and must not ship to users.
  if (!__DEV__ && !attestService) return;
  try {
    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: () => (__DEV__ || !attestService ? debugToken(app) : appAttestToken(app, attestService)),
      }),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    reportError(err, 'appcheck:init');
  }
}
