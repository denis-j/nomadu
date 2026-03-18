const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent';

// ─── Core call ───────────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_KEY) throw new Error('NO_KEY');

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 512, temperature: 0.8 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  console.log('[AI] response:', text.slice(0, 200));
  return text;
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
): Promise<StopSuggestion[]> {
  const itinerary = legs
    .map((l) => `• ${l.city}, ${l.country} (${l.startDate} → ${l.endDate})`)
    .join('\n');

  const lastEnd = legs[legs.length - 1]?.endDate ?? new Date().toISOString().slice(0, 10);

  const contextBlock = visaTaxContext
    ? `\nTraveler visa & tax constraints — factor these into your suggestions:\n${visaTaxContext}\n`
    : '';

  const prompt = `You are a travel advisor for a digital nomad.
Journey: "${journeyTitle}"

Existing stops:
${itinerary}
${contextBlock}
The last stop ends on ${lastEnd}. Suggest 3 great next destinations.
Consider: logical travel flow, proximity, variety, digital nomad suitability.
If visa/tax data is provided: avoid destinations where the traveler has critical/exceeded visa status, mention remaining days in the reason when relevant (e.g. "45 Schengen days left"), warn if tax residence threshold is close.
For each stop suggest realistic stay dates (starting 1 day after the previous stop ends, typical stay 5-14 days).
For transport pick the most realistic option: flight (intercontinental/long distance), train (same region), bus (nearby), ferry (island/coast), car (short road trip), walk (same city area).

Return ONLY a JSON array — no markdown, no prose:
[{"city":"...","country":"...","reason":"...","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","transport":"flight|train|car|bus|ferry|walk"},...]
"reason" must be ≤80 characters. Return exactly 3 objects.`;

  const raw = await callGemini(prompt);
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`No JSON array in response: ${raw.slice(0, 300)}`);
  const parsed = JSON.parse(match[0]) as StopSuggestion[];
  return parsed.slice(0, 3);
}

// ─── City tips ────────────────────────────────────────────────────────────────

export async function getCityTips(city: string, country: string): Promise<string> {
  const prompt = `Give 3 short practical tips for a digital nomad visiting ${city}, ${country}.
Cover: best area to stay, co-working / café scene, and one local highlight worth trying.
Max 100 words total. Format as 3 bullet points starting with "·".`;
  return callGemini(prompt);
}
