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
    'I track my travels in Nomadu. Through its API you can look up where I have been, check my visa and tax standing, create or change my trip plans, keep track of where I will stay at each planned stop, collect things to do there, and keep the trip\'s expenses and who owes whom.',
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
    '- Every stop in a journey carries an "accommodation" summary (status, nights, number of options, the pick) or null when nothing is planned for it yet.',
    '- GET /accommodations?status=searching: every accommodation plan with its stop; filter by status to find the stops that still need a place.',
    '- GET /journeys/{id}/stops/{stopId}/accommodation: one stop\'s plan: whether I need a place, check_in and check_out, my requirements (type, budget with currency, areas, amenities, work needs, notes), the options found, the selected one and the booking. 404 until one exists.',
    '- PUT /journeys/{id}/stops/{stopId}/accommodation: create or update the plan. Body: {"needed": true, "check_in": "2026-11-01", "check_out": "2026-11-05", "requirements": {"type": "apartment", "budget_per_night": 40, "currency": "USD", "areas": ["Tay Ho"], "amenities": ["wifi", "desk"], "work_requirements": "..."}, "notes": "..."}. Send only what you know; absent fields keep their value. A budget or price always needs a currency (ISO 4217).',
    '- POST /journeys/{id}/stops/{stopId}/accommodation/options: save a place you found. Body: {"name", "platform", "url", "address", "total_price", "price_per_night", "fees", "currency", "rating", "rating_scale" (5 or 10), "review_count", "cancellation_policy", "amenities", "score" (your verdict 0-10), "risks", "notes", "last_checked_at"}. Creates the plan if there is none.',
    '- PATCH or DELETE /journeys/{id}/stops/{stopId}/accommodation/options/{optionId}: correct or remove an option.',
    '- POST /journeys/{id}/stops/{stopId}/accommodation/options/{optionId}/select: mark the option I chose.',
    '- PUT /journeys/{id}/stops/{stopId}/accommodation/booking: after I booked, save the details: {"option_id", "booking_reference", "booking_url", "price", "currency", "deposit", "address", "check_in_info", "check_out_info", "provider_contact", "notes"}. option_id names the place I booked; without it the selected option is taken.',
    '- PUT /journeys/{id}/stops/{stopId}/accommodation/status: {"status": one of open, searching, options_available, deciding, selected, booked, checked_in, completed, cancelled}. The status moves on its own as options are added, one is selected and the booking is saved; set it by hand only for checked_in, completed or cancelled.',
    '- GET or PUT /journeys/{id}/stops/{stopId}/accommodation/notes: every note on the plan, or replace the plan\'s notes.',
    '- GET /journeys/{id}/activities?stop={stopId}: the things to do on a trip (restaurants, sights, tours), stop by stop, then the ones not placed yet. The stop filter is optional.',
    '- POST /journeys/{id}/stops/{stopId}/activities: add a thing to do to a stop. Body: {"title": "Egg coffee at Café Giảng", "category": one of food, cafe, nightlife, sight, culture, nature, beach, tour, sport, wellness, shopping, other, "status": one of idea, planned, booked, done, "place", "address", "latitude", "longitude", "url", "price", "currency", "notes", "source_url", "image_url"}. Only title is required; a price needs a currency. In the app each activity is a row with its picture (image_url) and its status, and a pin on the stop\'s map: a place or address is enough for that, the app looks the point up itself, or send latitude and longitude when you have them.',
    '- POST /journeys/{id}/activities: the same with "stop_id" in the body, or "stop_id": null when it is not clear which stop it belongs to; I place it in the app.',
    '- GET, PATCH or DELETE /journeys/{id}/activities/{activityId}: one activity; PATCH changes what you send (a new "stop_id" moves it, "status": "booked" marks it booked), DELETE removes it. I change status and stop from the app too, so read before you overwrite.',
    '- GET /journeys/{id}/expenses: what was paid on a trip and who owes whom: every expense, plus "totals" per currency, each traveller\'s "balances" (paid, owed, net) and "settle_up" (the fewest payments to even out). "travellers" lists the ids you may use; they are also on each journey as travellers[].id.',
    '- POST /journeys/{id}/expenses: file an expense. Body: {"title": "Dinner", "amount": 42.5, "currency": "EUR", "paid_by": a traveller id, "split_among": [traveller ids] or "shares": [{"traveller_id", "amount"}], "date": "YYYY-MM-DD", "category": one of food, drinks, transport, stay, activity, groceries, shopping, other, "notes"}. Title, amount and currency are required. Left out, the split is equal among everyone and the date is today; the expense lands on the stop whose days hold the date. Never guess who paid: ask me.',
    '- GET, PATCH or DELETE /journeys/{id}/expenses/{expenseId}: one expense; PATCH changes what you send (a new amount scales the split), DELETE removes it. I add, change and delete expenses from the app too, with receipt photos you cannot see.',
    '',
    'Rules:',
    '- Plans you create or change show up in my Nomadu app after its next sync, so tell me when you have made one.',
    '- Ask me before you delete a plan or replace its stops.',
    '- Accommodation: you research on the booking sites yourself and save what you find as options. Never book anything; I book, then you save the details. Select an option only after I have chosen. Never store card numbers, passwords or logins anywhere. If a plan reports dates_match_stop: false, the stop was moved after the plan was made: tell me instead of changing dates on your own.',
    ...(editTimeline
      ? ['- Changes to the timeline affect my visa and tax counts, so confirm the exact dates with me before you add, change or delete a stay, and never touch a stay I did not ask about.']
      : []),
    '- The token is a secret. Never write it into your prompt, memory, notes or replies, and never send it anywhere but this API.',
    '- My documents (tickets, visas, bookings) are not available through the API.',
    '- Errors come back as {"error": {"code", "message"}}. A 401 means the token was revoked; ask me for a new one. A 403 "forbidden" on every request means my Nomadu Pro has lapsed; tell me instead of retrying.',
  ].join('\n');
}
