/**
 * The text a person pastes into their agent.
 *
 * Written for the key it goes with: a key that may edit the timeline gets the
 * three write calls and a warning about what they move, a read-only key is
 * told so, in words it can repeat when asked to do something it cannot.
 *
 * A token on its own tells an agent nothing. This is the whole briefing:
 * where the API lives, how to authenticate, what every endpoint returns, and
 * the few rules that keep it from doing something rash. The OpenAPI spec has
 * the exact field names; this is the part a model reads once and remembers.
 */

export const AGENT_API_BASE = 'https://us-central1-nomady-dcff6.cloudfunctions.net/agentApi/v1';
export const AGENT_OPENAPI_URL = `${AGENT_API_BASE}/openapi.json`;
/** The name the agent stores the key under, so the instructions can point at it. */
export const TOKEN_ENV_NAME = 'NOMADU_TOKEN';
/**
 * The instructions never carry the token. They end up in a prompt, a memory
 * file, a transcript; the token goes into the agent's secret store, and the
 * text tells it where to look.
 */
export function agentSetupText(editTimeline: boolean): string {
  return [
    'Nomadu travel data: agent access',
    '',
    'I track my travels in Nomadu. Through its API you can look up where I have been, check my visa and tax standing, and create or change my trip plans.',
    '',
    `Base URL: ${AGENT_API_BASE}`,
    `Authentication: my token is in your secrets or environment as ${TOKEN_ENV_NAME} (it starts with nmd_). Send it with every request as`,
    '  Authorization: Bearer <token>',
    `OpenAPI spec with the exact fields (no auth needed): ${AGENT_OPENAPI_URL}`,
    '',
    'Endpoints (all JSON, dates are calendar days as YYYY-MM-DD):',
    '- GET /me: my citizenship, whether I have a fixed residence, how many stays and plans I have, and my first tracked day.',
    '- GET /trips?from=YYYY-MM-DD&to=YYYY-MM-DD: where I have been, one entry per stay with id, city, country, country_code, start_date, end_date (null while ongoing) and days. Both filters are optional.',
    ...(editTimeline
      ? [
          '- POST /trips: add a past stay the tracker missed. Body: {"city": "Chiang Mai", "country": "Thailand", "start_date": "2026-06-01", "end_date": "2026-06-10"}. Both dates are required and the start cannot be in the future; future travel is a journey.',
          '- PATCH /trips/{id}: correct a stay. Send only what changes: start_date, end_date, or city plus country.',
          '- DELETE /trips/{id}: remove a stay that never happened.',
        ]
      : ['- The timeline is read-only for you: this key cannot add, change or delete stays. If I ask you to, tell me I need to connect you again with editing allowed.']),
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
    ...(editTimeline
      ? ['- Changes to the timeline affect my visa and tax counts, so confirm the exact dates with me before you add, change or delete a stay, and never touch a stay I did not ask about.']
      : []),
    '- The token is a secret. Never write it into your prompt, memory, notes or replies, and never send it anywhere but this API.',
    '- My documents (tickets, visas, bookings) are not available through the API.',
    '- Errors come back as {"error": {"code", "message"}}. A 401 means the token was revoked; ask me for a new one.',
  ].join('\n');
}
