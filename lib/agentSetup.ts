/**
 * The text a person pastes into their agent.
 *
 * A token on its own tells an agent nothing. This is the whole briefing in
 * one paste: where the API lives, how to authenticate, what every endpoint
 * returns, and the few rules that keep it from doing something rash. The
 * OpenAPI spec has the exact field names; this is the part a model reads
 * once and remembers.
 */

export const AGENT_API_BASE = 'https://us-central1-nomady-dcff6.cloudfunctions.net/agentApi/v1';
export const AGENT_OPENAPI_URL = `${AGENT_API_BASE}/openapi.json`;
export const TOKEN_PLACEHOLDER = '<paste your Nomadu token here>';

export function agentSetupText(token: string | null): string {
  return [
    'Nomadu travel data: agent access',
    '',
    'I track my travels in Nomadu. Through its API you can look up where I have been, check my visa and tax standing, and create or change my trip plans.',
    '',
    `Base URL: ${AGENT_API_BASE}`,
    `Authentication: send this header with every request`,
    `  Authorization: Bearer ${token ?? TOKEN_PLACEHOLDER}`,
    `OpenAPI spec with the exact fields (no auth needed): ${AGENT_OPENAPI_URL}`,
    '',
    'Endpoints (all JSON, dates are calendar days as YYYY-MM-DD):',
    '- GET /me: my citizenship, whether I have a fixed residence, how many stays and plans I have, and my first tracked day.',
    '- GET /trips?from=YYYY-MM-DD&to=YYYY-MM-DD: where I have been, one entry per stay with city, country, country_code, start_date, end_date (null while ongoing) and days. Both filters are optional.',
    '- GET /stats?year=YYYY: days away from home, countries, cities and stops. Leave out year for all time.',
    '- GET /visa: my visa allowance per destination: days allowed, used and remaining, and a status.',
    '- GET /tax: my tax residency exposure per country for the current year.',
    '- GET /journeys: my planned trips, each with a title and its stops.',
    '- POST /journeys: create a plan. Body: {"title": "...", "stops": [{"city": "Bangkok", "country": "Thailand", "start_date": "2026-11-01", "days": 5, "transport": "flight", "notes": "..."}, ...]}. Only the first stop needs a start_date; every later stop starts the day after the previous one ends. Give each stop either days or end_date. transport is one of flight, train, car, bus, ferry, walk. country can also be given as country_code (ISO 3166-1 alpha-2).',
    '- GET /journeys/{id}: one plan.',
    '- PATCH /journeys/{id}: rename a plan (title) or replace its stops (same shape as POST).',
    '- DELETE /journeys/{id}: delete a plan.',
    '',
    'Rules:',
    '- Plans you create or change show up in my Nomadu app after its next sync, so tell me when you have made one.',
    '- Ask me before you delete a plan or replace its stops.',
    '- My tracked stays are read-only, and my documents (tickets, visas, bookings) are not available through the API.',
    '- Errors come back as {"error": {"code", "message"}}. A 401 means the token was revoked; ask me for a new one.',
  ].join('\n');
}
