/**
 * Gemini client. The API key lives in Secret Manager and never leaves the
 * function; it is passed in by the caller from `geminiKey.value()`.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

const MODEL = 'gemini-3.1-flash-lite';
const ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/** Upstream call budget. Gemini occasionally takes a while on vision requests. */
const TIMEOUT_MS = 60_000;

interface Part {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

async function generate(
  apiKey: string,
  parts: Part[],
  maxOutputTokens: number,
  temperature: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens, temperature },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    // Covers both the abort above and genuine network failures.
    logger.error('Gemini request failed', { err: String(err) });
    throw new HttpsError('unavailable', 'The AI service did not respond. Please try again.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Log the upstream detail for us, but never hand it back to the client:
    // Gemini error bodies can echo the request URL, which contains the key.
    logger.error('Gemini returned an error', { status: res.status, body: body.slice(0, 500) });

    if (res.status === 429) {
      throw new HttpsError('resource-exhausted', 'The AI service is busy. Please try again shortly.');
    }
    throw new HttpsError('unavailable', 'The AI service is currently unavailable.');
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text ?? '';

  if (!text) {
    logger.warn('Gemini returned no text', { finishReason: candidate?.finishReason });
  }
  return text;
}

export function generateText(
  apiKey: string,
  prompt: string,
  maxOutputTokens = 512,
  temperature = 0.8,
): Promise<string> {
  return generate(apiKey, [{ text: prompt }], maxOutputTokens, temperature);
}

export function generateFromImage(
  apiKey: string,
  prompt: string,
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  return generate(
    apiKey,
    [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }],
    2048,
    0.2,
  );
}

/**
 * Pull the first JSON array out of a model response.
 *
 * The prompts ask for bare JSON, but the model still wraps it in ```json
 * fences often enough that stripping them is worth doing before the match.
 */
export function extractJsonArray(raw: string): unknown[] | null {
  const cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
