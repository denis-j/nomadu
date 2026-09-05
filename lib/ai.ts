/**
 * Client side of the AI features.
 *
 * There is no API key here. Every call goes through a callable Cloud Function
 * (see `functions/src/index.ts`) which holds the Gemini key in Secret Manager,
 * builds the prompt, and enforces a per-user daily budget. The client only
 * ever sends structured parameters.
 *
 * The exported signatures are unchanged from the direct-to-Gemini version, so
 * the four call sites did not have to move.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { FunctionsError, httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

/**
 * Turn a Functions error into something worth showing a user.
 *
 * `resource-exhausted` is the daily limit and carries a message written for
 * the user, so it is passed through. Everything else gets a generic line: the
 * raw text can name internals we would rather not surface.
 */
function toUserFacingError(err: unknown): Error {
  const code = (err as FunctionsError)?.code;
  const message = (err as FunctionsError)?.message;

  if (code === 'functions/resource-exhausted' && message) return new Error(message);
  if (code === 'functions/unauthenticated') {
    return new Error('Please sign in to use this feature.');
  }
  if (code === 'functions/unavailable') {
    return new Error('The AI service is unavailable right now. Please try again.');
  }
  return new Error('Something went wrong. Please try again.');
}

async function call<TRequest, TResponse>(
  name: string,
  payload: TRequest,
): Promise<TResponse> {
  try {
    const fn = httpsCallable<TRequest, TResponse>(functions, name);
    const result = await fn(payload);
    return result.data;
  } catch (err) {
    throw toUserFacingError(err);
  }
}

// ─── Stop suggestions ─────────────────────────────────────────────────────────

export type SuggestedTransport = 'flight' | 'train' | 'car' | 'bus' | 'ferry' | 'walk';

export interface StopSuggestion {
  city: string;
  country: string;
  reason: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  transport: SuggestedTransport;
}

export async function suggestNextStops(
  journeyTitle: string,
  legs: { city: string; country: string; startDate: string; endDate: string }[],
  visaTaxContext?: string,
  userPreference?: string,
): Promise<StopSuggestion[]> {
  const { suggestions } = await call<
    {
      journeyTitle: string;
      legs: { city: string; country: string; startDate: string; endDate: string }[];
      visaTaxContext?: string;
      userPreference?: string;
    },
    { suggestions: StopSuggestion[] }
  >('suggestStops', {
    journeyTitle,
    legs,
    visaTaxContext,
    userPreference: userPreference?.trim() || undefined,
  });

  return suggestions;
}

// ─── City tips ────────────────────────────────────────────────────────────────

export async function getCityTips(city: string, country: string): Promise<string> {
  const cacheKey = `city_tips_${city}_${country}`.replace(/\s+/g, '_').toLowerCase();
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch {}

  const { tips } = await call<{ city: string; country: string }, { tips: string }>(
    'cityTips',
    { city, country },
  );

  AsyncStorage.setItem(cacheKey, tips).catch(() => {});
  return tips;
}

// ─── Trip extraction from screenshots ────────────────────────────────────────

export interface ExtractedTrip {
  city: string;
  country: string;
  countryCode?: string; // ISO-2 if known
  startDate: string;    // YYYY-MM-DD
  endDate: string | null;
  confidence: number;   // 0..1
}

export async function extractTripsFromImage(
  imageBase64: string,
  mimeType = 'image/jpeg',
): Promise<ExtractedTrip[]> {
  const { trips } = await call<
    { imageBase64: string; mimeType: string },
    { trips: ExtractedTrip[] }
  >('extractTrips', { imageBase64, mimeType });

  return trips;
}
