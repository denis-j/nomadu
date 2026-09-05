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
import { defineSecret } from 'firebase-functions/params';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

import { generateFromImage, generateText, extractJsonArray } from './gemini';
import {
  TRIP_EXTRACTION_PROMPT,
  buildCityTipsPrompt,
  buildStopSuggestionPrompt,
  sanitize,
  type Leg,
} from './prompts';
import { consumeQuota } from './rateLimit';

initializeApp();

export { deleteAccount } from './deleteAccount';

const geminiKey = defineSecret('GEMINI_API_KEY');

/** Shared deployment options. Adjust `region` if your Firestore lives elsewhere. */
const options = {
  region: 'us-central1',
  secrets: [geminiKey],
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

  await consumeQuota(uid, 'cityTips');

  const text = await generateText(geminiKey.value(), buildCityTipsPrompt(city, country), 512, 0.8);
  if (!text) {
    throw new HttpsError('internal', 'The AI returned an empty response. Please try again.');
  }
  return { tips: text };
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
