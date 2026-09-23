/**
 * Who may spend money on the server: a paying account, from the real app.
 *
 * The paywall only ever lived in the app's routing. Anyone could sign up
 * through the public Firebase REST API in a loop and call the Gemini
 * functions from a script; the per-account daily quota did nothing against
 * a new account per run. Two checks close that:
 *
 *   - Pro: the account holds the RevenueCat entitlement. Asked of RevenueCat
 *     with the secret key and cached in `entitlements/{uid}` (closed to
 *     clients by the catch-all rule), so a busy user costs one lookup every
 *     few hours, not one per call.
 *   - App Check: the request carries a valid token from the app on a real
 *     device. Needs the client side (App Attest) before it can be enforced.
 *
 * Both roll out the same way, switched in `functions/.env`:
 *
 *   off      no check at all
 *   log      check and log who would have been refused, refuse nobody
 *   enforce  refuse
 *
 * A check that cannot run is never a reason to lock paying users out: no
 * key configured, or RevenueCat unreachable, lets the call through and logs
 * an error. What it refuses is an answer, "this account has no Pro".
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

/** The entitlement the app sells (lib/revenueCat.ts, ENTITLEMENT_ID). */
export const ENTITLEMENT_ID = 'MMM 0 LLC Pro';

/** RevenueCat secret API key (sk_…). Bound to every function that checks Pro. */
export const revenueCatKey = defineSecret('REVENUECAT_SECRET_KEY');

export type Mode = 'off' | 'log' | 'enforce';

function modeOf(name: string, fallback: Mode): Mode {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  return raw === 'off' || raw === 'log' || raw === 'enforce' ? raw : fallback;
}

/** Re-read on every call, so tests (and a redeploy with a new .env) can switch it. */
export const entitlementMode = (): Mode => modeOf('ENTITLEMENT_MODE', 'log');
export const appCheckMode = (): Mode => modeOf('APP_CHECK_MODE', 'off');

/** A confirmed Pro answer is trusted this long before RevenueCat is asked again. */
const PRO_TTL_MS = 6 * 60 * 60 * 1000;
/** A "no" is kept briefly: long enough to absorb a loop, short enough for a fresh purchase. */
const NOT_PRO_TTL_MS = 60 * 1000;
/** When RevenueCat is down, a Pro answer this old still counts. */
const STALE_PRO_MS = 7 * 24 * 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 5000;

type Verdict = { pro: boolean; source: 'cache' | 'revenuecat' | 'stale-cache' | 'unchecked' };

interface CacheDoc {
  pro: boolean;
  checked_at: Timestamp;
  /** When the entitlement runs out; null for lifetime or for "not Pro". */
  expires_at: Timestamp | null;
}

function readKey(): string {
  try {
    return revenueCatKey.value() ?? '';
  } catch {
    // Outside the Functions runtime (tests) there is no secret.
    return process.env.REVENUECAT_SECRET_KEY ?? '';
  }
}

/** Active now: no expiry (lifetime) or an expiry, or grace period, still ahead. */
export function activeUntil(entitlement: Record<string, unknown> | undefined, now: number): { active: boolean; until: number | null } {
  if (!entitlement) return { active: false, until: null };
  const ends = [entitlement.expires_date, entitlement.grace_period_expires_date]
    .filter((v): v is string => typeof v === 'string')
    .map((v) => Date.parse(v))
    .filter((t) => Number.isFinite(t));
  if (entitlement.expires_date === null || entitlement.expires_date === undefined) {
    return { active: true, until: null };
  }
  const until = ends.length ? Math.max(...ends) : NaN;
  return { active: Number.isFinite(until) && until > now, until: Number.isFinite(until) ? until : null };
}

async function askRevenueCat(uid: string, key: string): Promise<{ pro: boolean; until: number | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`RevenueCat ${res.status}`);
    const body = (await res.json()) as { subscriber?: { entitlements?: Record<string, Record<string, unknown>> } };
    const { active, until } = activeUntil(body.subscriber?.entitlements?.[ENTITLEMENT_ID], Date.now());
    return { pro: active, until };
  } finally {
    clearTimeout(timer);
  }
}

/** Does this account hold Pro right now? Never throws. */
export async function checkPro(uid: string): Promise<Verdict> {
  const db = getFirestore();
  const ref = db.collection('entitlements').doc(uid);
  const now = Date.now();
  const cached = (await ref.get()).data() as CacheDoc | undefined;

  if (cached?.checked_at) {
    const age = now - cached.checked_at.toMillis();
    const expired = cached.expires_at !== null && cached.expires_at !== undefined && cached.expires_at.toMillis() <= now;
    if (cached.pro && !expired && age < PRO_TTL_MS) return { pro: true, source: 'cache' };
    if (!cached.pro && age < NOT_PRO_TTL_MS) return { pro: false, source: 'cache' };
  }

  const key = readKey();
  if (!key) {
    logger.error('entitlement check skipped: REVENUECAT_SECRET_KEY is not set', { uid });
    return { pro: true, source: 'unchecked' };
  }

  try {
    const { pro, until } = await askRevenueCat(uid, key);
    await ref.set({
      pro,
      checked_at: Timestamp.fromDate(new Date(now)),
      expires_at: pro && until !== null ? Timestamp.fromDate(new Date(until)) : null,
    });
    return { pro, source: 'revenuecat' };
  } catch (err) {
    const staleOk = cached?.pro === true && now - cached.checked_at.toMillis() < STALE_PRO_MS;
    logger.error('entitlement check failed, letting the call through', { uid, err: String(err), staleOk });
    return { pro: true, source: staleOk ? 'stale-cache' : 'unchecked' };
  }
}

/**
 * Refuse accounts without Pro (in `enforce`), or log them (in `log`).
 * `what` names the feature in the log line.
 */
export async function requirePro(uid: string, what: string): Promise<void> {
  const mode = entitlementMode();
  if (mode === 'off') return;
  const verdict = await checkPro(uid);
  if (verdict.pro) return;
  if (mode === 'log') {
    logger.warn('would refuse: no Pro', { uid, what, source: verdict.source });
    return;
  }
  logger.warn('refused: no Pro', { uid, what, source: verdict.source });
  throw new HttpsError('permission-denied', 'This feature is part of Nomadu Pro.');
}

/**
 * Refuse callable requests without a valid App Check token (in `enforce`),
 * or log them (in `log`). With `enforceAppCheck` left off, the SDK still
 * verifies a token that is sent and exposes the result as `request.app`;
 * a missing or invalid one simply leaves it undefined.
 */
export function requireAppCheck(request: CallableRequest, what: string): void {
  const mode = appCheckMode();
  if (mode === 'off' || request.app) return;
  if (mode === 'log') {
    logger.warn('would refuse: no App Check token', { uid: request.auth?.uid, what });
    return;
  }
  throw new HttpsError('failed-precondition', 'Please update Nomadu to the latest version.');
}

/** Both gates, for the callables that spend money. */
export async function requireAppAccess(request: CallableRequest, uid: string, what: string): Promise<void> {
  requireAppCheck(request, what);
  await requirePro(uid, what);
}
