/**
 * Server-side Gemini proxy.
 *
 * Before this existed, `EXPO_PUBLIC_GEMINI_API_KEY` was inlined into the JS
 * bundle and could be recovered from a shipped build with `strings`. The key
 * now lives in Secret Manager and is only ever read inside these functions.
 *
 * Two rules keep the proxy from becoming a free Gemini gateway for anyone who
 * signs up: the prompts are built here from structured parameters (see
 * prompts.ts) rather than sent by the client, and every call is counted
 * against a per-user daily budget (see rateLimit.ts).
 */

import { initializeApp } from 'firebase-admin/app';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

import { generateFromImage, generateText, extractJsonArray, extractJsonObject, geminiKey } from './gemini';
import { EXPENSE_CATEGORIES } from '../../lib/expenseModel';
import {
  RECEIPT_PROMPT,
  TRIP_EXTRACTION_PROMPT,
  buildActivitySuggestionPrompt,
  buildCityTipsPrompt,
  buildStopSuggestionPrompt,
  coerceActivitySuggestions,
  sanitize,
  type Leg,
} from './prompts';
import { consumeQuota } from './rateLimit';
import { cachedCityTips, isPlainPlaceName } from './cityTips';
import { requireAppAccess, revenueCatKey } from './access';

initializeApp();

export { deleteAccount } from './deleteAccount';
export { agentApi, createAgentToken, revokeAgentToken, listAgentTokens } from './agent';
export { shareJourney, previewInvite, joinJourney, leaveJourney, removeJourneyMember, unshareJourney, setJourneyMemberCanEdit, updateSharedJourney, updateSharedAccommodation, updateSharedActivity, updateSharedExpense, sharePage, sharedProfiles, mirrorJourney, mirrorAccommodation, mirrorActivity, mirrorExpense } from './share';
export { importActivityLink } from './linkImport';
export { sharedDocumentFiles } from './documentFiles';

/** Shared deployment options. Adjust `region` if your Firestore lives elsewhere. */
const options = {
  region: 'us-central1',
  secrets: [geminiKey, revenueCatKey],
  // Vision requests carry a base64 screenshot, so they need more headroom than
  // the default 256 MiB and longer than the default 60 s.
  memory: '512MiB' as const,
  timeoutSeconds: 120,
};

function requireUid(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to use this feature.');
  }
  return uid;
}

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpsError('invalid-argument', `"${field}" is required.`);
  }
  return sanitize(value, maxLength);
}

// ─── Stop suggestions ────────────────────────────────────────────────────────

const MAX_LEGS = 40;

export const suggestStops = onCall(options, async (request) => {
  const uid = requireUid(request);
  const data = request.data ?? {};

  const journeyTitle = requireString(data.journeyTitle, 'journeyTitle', 120);

  if (!Array.isArray(data.legs) || data.legs.length === 0) {
    throw new HttpsError('invalid-argument', '"legs" must be a non-empty array.');
  }
  if (data.legs.length > MAX_LEGS) {
    throw new HttpsError('invalid-argument', `A journey may have at most ${MAX_LEGS} stops.`);
  }

  const legs: Leg[] = data.legs.map((leg: Record<string, unknown>, i: number) => ({
    city: requireString(leg?.city, `legs[${i}].city`, 80),
    country: requireString(leg?.country, `legs[${i}].country`, 80),
    startDate: requireString(leg?.startDate, `legs[${i}].startDate`, 10),
    endDate: requireString(leg?.endDate, `legs[${i}].endDate`, 10),
  }));

  const visaTaxContext =
    typeof data.visaTaxContext === 'string' && data.visaTaxContext.trim()
      ? sanitize(data.visaTaxContext, 2000)
      : undefined;
  const userPreference =
    typeof data.userPreference === 'string' && data.userPreference.trim()
      ? sanitize(data.userPreference, 300)
      : undefined;

  await requireAppAccess(request, uid, 'suggestStops');
  await consumeQuota(uid, 'suggestStops');

  const prompt = buildStopSuggestionPrompt(journeyTitle, legs, visaTaxContext, userPreference);
  const raw = await generateText(geminiKey.value(), prompt, 512, 0.8);

  const parsed = extractJsonArray(raw);
  if (!parsed) {
    logger.warn('suggestStops: no JSON array in response', { preview: raw.slice(0, 300) });
    throw new HttpsError('internal', 'Could not read the AI response. Please try again.');
  }

  return { suggestions: parsed.slice(0, 3) };
});

// ─── City tips ───────────────────────────────────────────────────────────────

export const cityTips = onCall(options, async (request) => {
  const uid = requireUid(request);
  const data = request.data ?? {};

  const city = requireString(data.city, 'city', 80);
  const country = requireString(data.country, 'country', 80);
  if (!isPlainPlaceName(city) || !isPlainPlaceName(country)) {
    throw new HttpsError('invalid-argument', 'No tips for this place.');
  }

  // Shared across users: the model runs once per city, then everyone reads
  // the same answer back. The quota is only spent when it does run.
  // Reading tips someone else already paid for costs nothing; only a new
  // generation has to come from a paying account in the real app.
  const { tips } = await cachedCityTips(city, country, async () => {
    await requireAppAccess(request, uid, 'cityTips');
    await consumeQuota(uid, 'cityTips');
    const text = await generateText(geminiKey.value(), buildCityTipsPrompt(city, country), 512, 0.8);
    if (!text) {
      throw new HttpsError('internal', 'The AI returned an empty response. Please try again.');
    }
    return text;
  });
  return { tips };
});

// ─── Activity suggestions ────────────────────────────────────────────────────

const MAX_EXISTING_TITLES = 50;

export const suggestActivities = onCall(options, async (request) => {
  const uid = requireUid(request);
  const data = request.data ?? {};

  const city = requireString(data.city, 'city', 80);
  const country = requireString(data.country, 'country', 80);
  const startDate = requireString(data.startDate, 'startDate', 10);
  const endDate = requireString(data.endDate, 'endDate', 10);
  if (data.existing !== undefined && !Array.isArray(data.existing)) {
    throw new HttpsError('invalid-argument', '"existing" must be a list of titles.');
  }
  // What is already planned, so the model offers something new. A longer
  // list is cut rather than refused: the newest ideas matter least here.
  const existing: string[] = (Array.isArray(data.existing) ? data.existing : [])
    .filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0)
    .slice(0, MAX_EXISTING_TITLES)
    .map((t: string) => sanitize(t, 120));
  const interests =
    typeof data.interests === 'string' && data.interests.trim() ? sanitize(data.interests, 300) : undefined;

  await requireAppAccess(request, uid, 'suggestActivities');
  await consumeQuota(uid, 'suggestActivities');

  const prompt = buildActivitySuggestionPrompt({ city, country, startDate, endDate, existing, interests });
  const raw = await generateText(geminiKey.value(), prompt, 2048, 0.8);

  const parsed = extractJsonArray(raw);
  if (!parsed) {
    logger.warn('suggestActivities: no JSON array in response', { preview: raw.slice(0, 300) });
    throw new HttpsError('internal', 'Could not read the AI response. Please try again.');
  }
  return { suggestions: coerceActivitySuggestions(parsed, existing) };
});

// ─── Trip extraction from a screenshot ───────────────────────────────────────

/**
 * Base64 blows a picture up by about a third, and a callable request has to
 * fit inside 10 MB. Rejecting oversized images here gives a clear error
 * instead of an opaque transport failure.
 */
const MAX_IMAGE_BASE64_BYTES = 7 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export const extractTrips = onCall(options, async (request) => {
  const uid = requireUid(request);
  const data = request.data ?? {};

  const imageBase64 = data.imageBase64;
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    throw new HttpsError('invalid-argument', '"imageBase64" is required.');
  }
  if (imageBase64.length > MAX_IMAGE_BASE64_BYTES) {
    throw new HttpsError('invalid-argument', 'That image is too large. Please pick a smaller one.');
  }

  const mimeType =
    typeof data.mimeType === 'string' && ALLOWED_MIME.includes(data.mimeType)
      ? data.mimeType
      : 'image/jpeg';

  await requireAppAccess(request, uid, 'extractTrips');
  await consumeQuota(uid, 'extractTrips');

  const raw = await generateFromImage(
    geminiKey.value(),
    TRIP_EXTRACTION_PROMPT,
    imageBase64,
    mimeType,
  );

  // An unreadable screenshot is a normal outcome here, not an error: the
  // import screen shows "nothing found" per image and moves on.
  const parsed = extractJsonArray(raw);
  if (!parsed) {
    logger.warn('extractTrips: no JSON array in response', { preview: raw.slice(0, 300) });
    return { trips: [] };
  }

  const trips = parsed.filter((t): t is Record<string, unknown> => {
    if (!t || typeof t !== 'object') return false;
    const row = t as Record<string, unknown>;
    return (
      typeof row.city === 'string' &&
      typeof row.country === 'string' &&
      typeof row.startDate === 'string'
    );
  });

  return { trips };
});

// ─── A receipt, read ─────────────────────────────────────────────────────────

/**
 * What was paid, off a photo of the receipt: the total, its currency, the
 * merchant and the date, for the expense form to start from. The user
 * checks and saves; an unreadable picture is an empty answer, not an error.
 */
export const readReceipt = onCall(options, async (request) => {
  const uid = requireUid(request);
  const data = request.data ?? {};

  const imageBase64 = data.imageBase64;
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    throw new HttpsError('invalid-argument', '"imageBase64" is required.');
  }
  if (imageBase64.length > MAX_IMAGE_BASE64_BYTES) {
    throw new HttpsError('invalid-argument', 'That image is too large. Please pick a smaller one.');
  }
  const mimeType =
    typeof data.mimeType === 'string' && ALLOWED_MIME.includes(data.mimeType)
      ? data.mimeType
      : 'image/jpeg';

  await requireAppAccess(request, uid, 'readReceipt');
  await consumeQuota(uid, 'readReceipt');

  const raw = await generateFromImage(geminiKey.value(), RECEIPT_PROMPT, imageBase64, mimeType);
  const parsed = extractJsonObject(raw);
  if (!parsed) {
    logger.warn('readReceipt: no JSON object in response', { preview: raw.slice(0, 300) });
    return { receipt: null };
  }
  const amount = typeof parsed.amount === 'number' && Number.isFinite(parsed.amount) && parsed.amount > 0 ? Math.round(parsed.amount * 100) / 100 : null;
  if (amount === null) return { receipt: null };
  const currency = typeof parsed.currency === 'string' && /^[A-Za-z]{3}$/.test(parsed.currency.trim()) ? parsed.currency.trim().toUpperCase() : null;
  const date = typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
  const category = typeof parsed.category === 'string' && (EXPENSE_CATEGORIES as readonly string[]).includes(parsed.category) ? parsed.category : 'other';
  const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
  return {
    receipt: {
      title: typeof parsed.title === 'string' && parsed.title.trim() ? sanitize(parsed.title, 120) : null,
      amount,
      currency,
      date,
      category,
      confidence,
    },
  };
});
