/**
 * Prompt construction. These live on the server on purpose.
 *
 * If the client sent a ready-made prompt and the function just forwarded it,
 * anyone with an account could use the deployed function as a free Gemini
 * gateway. The client sends structured parameters only; the wording is built
 * here and cannot be influenced beyond the fields below.
 */

export interface Leg {
  city: string;
  country: string;
  startDate: string;
  endDate: string;
}

/**
 * Normalise free-form user input before it is embedded in a prompt.
 *
 * Drops backticks and control characters (the sequences most useful for
 * escaping the surrounding block), collapses whitespace so a wall of newlines
 * cannot push the real instructions out of the model's attention, and caps
 * the length. Ordinary punctuation including hyphens is kept: city names like
 * "Aix-en-Provence" have to survive this.
 */
export function sanitize(input: string, maxLength: number): string {
  return input
    .replace(/[`\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function buildStopSuggestionPrompt(
  journeyTitle: string,
  legs: Leg[],
  visaTaxContext?: string,
  userPreference?: string,
): string {
  const itinerary = legs
    .map((l) => `• ${l.city}, ${l.country} (${l.startDate} → ${l.endDate})`)
    .join('\n');

  const lastEnd = legs[legs.length - 1]?.endDate ?? new Date().toISOString().slice(0, 10);

  const contextBlock = visaTaxContext
    ? `\nTraveler visa & tax constraints — factor these into your suggestions:\n${visaTaxContext}\n`
    : '';

  const preferenceBlock = userPreference
    ? `\nUSER PREFERENCE (high priority — shape your suggestions around this):\n"${userPreference}"\n`
    : '';

  return `You are a travel planning assistant specialized in digital nomads.

INPUT
Journey title: "${journeyTitle}"
Existing stops:
${itinerary}
${contextBlock}${preferenceBlock}
Last stop end date: ${lastEnd}

TASK
Suggest exactly 3 next destinations.

CONSTRAINTS
- The last stop defines the current country
${userPreference
  ? `- If the user preference implies specific destinations, countries, or themes: follow those over default country rules
- Otherwise fall back to: first 2 in same country, 3rd in a different country`
  : `- Suggest the first 2 destinations in the SAME country as the last stop
- These should explore new regions/cities, including islands where relevant
- The 3rd destination MUST be in a DIFFERENT country
- The new country must be geographically close and logically connected`}
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
}

export function buildCityTipsPrompt(city: string, country: string): string {
  return `You are a digital nomad city advisor.

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
}

export const TRIP_EXTRACTION_PROMPT = `You are looking at a screenshot that may contain travel information.
This could be a flight confirmation, hotel booking, itinerary, an export from another travel app,
a timeline view, or personal notes about trips.

TASK
Extract every distinct stay (city OR country level) you can identify. A "stay" = the traveler
being in one place for a continuous date range. Each row, card, or entry in a list of trips
counts. Do NOT extract layovers, in-transit flights, or entries explicitly marked "Transit".

OUTPUT
Return ONLY a valid JSON array, no markdown, no commentary, no explanation:

[
  {
    "city": "string (city name in English; if only a country is shown, use that country's capital city)",
    "country": "string (country name in English)",
    "countryCode": "ISO-2 country code, uppercase (or omit if unsure)",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD or null if the entry says 'Still here', 'Present', 'ongoing', or has no end",
    "confidence": 0.0-1.0
  }
]

RULES
- If you find NO trips at all, return [] (empty array)
- If a country list shows multiple entries (e.g. "Germany 9d", "Thailand 41d"), output each as a stay using the country's capital as city, and set confidence around 0.6
- confidence: 0.9+ when both city and dates are explicit; 0.6-0.8 when city was inferred from country; <0.6 when dates or place are unclear
- If the year is missing from a date, infer the nearest plausible year (prefer current year or the year implied by surrounding dates)
- "Still Here", "Present", "ongoing" → endDate: null
- Skip duplicates within the same screenshot
- Skip entries labelled "Transit", "Layover", "Connection"
- Dates must be valid calendar dates
- Do not invent dates or places that aren't on screen — lower confidence rather than guess`;
