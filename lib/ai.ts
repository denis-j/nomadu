import AsyncStorage from '@react-native-async-storage/async-storage';

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

  const prompt = `You are a travel planning assistant specialized in digital nomads.

INPUT
Journey title: "${journeyTitle}"
Existing stops:
${itinerary}
${contextBlock}
Last stop end date: ${lastEnd}

TASK
Suggest exactly 3 next destinations.

CONSTRAINTS
- The last stop defines the current country
- Suggest the first 2 destinations in the SAME country as the last stop
- These should explore new regions/cities, including islands where relevant
- The 3rd destination MUST be in a DIFFERENT country
- The new country must be geographically close and logically connected
- Each suggestion is an independent option, not part of a sequence
- Prefer nearby or well-connected locations before long-haul jumps
- Ensure variety across the 3 suggestions
- Prioritize digital nomad suitability (internet, cost, safety, visa friendliness)

VISA AND TAX
- If visa/tax data is provided in context:
- Avoid destinations where visa limits are exceeded or critical
- If relevant, include remaining days in reason (example: "45 Schengen days left")
- Warn briefly if close to tax residency thresholds

DATES
- ALL 3 suggestions are independent alternatives, NOT a sequence
- Each suggestion starts exactly 1 day after the last existing stop ends: ${lastEnd}
- Duration per stop: 5 to 14 days
- Do NOT chain dates across suggestions — each one starts from the same date

TRANSPORT SELECTION
Choose the most realistic option:
- flight: intercontinental or long distance
- train: same region with strong rail network
- bus: short to medium regional routes
- ferry: islands or coastal routes
- car: short road trips or poor public transport
- walk: same city or district only

OUTPUT FORMAT
Return ONLY valid JSON. No markdown, no explanation.

[
{
  "city": "string",
  "country": "string",
  "reason": "string (max 80 characters)",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "transport": "flight|train|car|bus|ferry|walk"
}
]

RULES
- Exactly 3 objects
- First 2 objects: same country as last stop
- 3rd object: different country
- No additional keys
- No text outside JSON
- Ensure valid JSON syntax
  `;

  const raw = await callGemini(prompt);
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`No JSON array in response: ${raw.slice(0, 300)}`);
  const parsed = JSON.parse(match[0]) as StopSuggestion[];
  return parsed.slice(0, 3);
}

// ─── City tips ────────────────────────────────────────────────────────────────

export async function getCityTips(city: string, country: string): Promise<string> {
  const cacheKey = `city_tips_${city}_${country}`.replace(/\s+/g, '_').toLowerCase();
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch {}

  const prompt = `You are a digital nomad city advisor.

INPUT
City: ${city}
Country: ${country}

TASK
Provide exactly 3 practical tips for a digital nomad.

CONTENT REQUIREMENTS
- Tip 1: Best area to stay (neighborhood + why)
- Tip 2: Co-working or café scene (specific vibe or spots)
- Tip 3: One local highlight worth trying (food, place, or experience)
- Focus on actionable, specific, non-generic advice
- Avoid fluff and vague statements

STYLE
- Max 120 words total
- Each tip must start with a bold title, followed by the text on the SAME line
- Use this exact format:

- **Title** Tip text

- Separate each bullet with ONE blank line
- No emojis

OUTPUT RULES
- Return ONLY markdown
- Exactly 3 bullet points
- No intro or outro text
- No extra formatting or deviations`;
  
  const result = await callGemini(prompt);
  AsyncStorage.setItem(cacheKey, result).catch(() => {});
  return result;
}
