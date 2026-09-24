/**
 * The agent API, described.
 *
 * Served live at /v1/openapi.json, rendered at /v1/docs, and dumped to
 * docs/openapi.json by `npm run openapi` so the spec can be read in the repo
 * and diffed in reviews. One object, no framework: the routes in agent.ts are
 * few enough that keeping this by hand is cheaper than generating it, and
 * the descriptions are written for a model that reads them once.
 */

import { ACCOMMODATION_STATUSES, ACCOMMODATION_TYPES, MAX_OPTIONS } from '../../lib/accommodationModel';

export const API_BASE = 'https://us-central1-nomady-dcff6.cloudfunctions.net/agentApi/v1';
export const TRANSPORTS = ['flight', 'train', 'car', 'bus', 'ferry', 'walk'] as const;

const date = { type: 'string', format: 'date', example: '2026-09-12' };
/** OpenAPI 3.1 spells nullable as a type union. */
const orNull = <T extends { type: string }>(schema: T) => ({ ...schema, type: [schema.type, 'null'] });
const countryCode = { type: 'string', minLength: 2, maxLength: 2, description: 'ISO 3166-1 alpha-2, upper case', example: 'TH' };

const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: {
          type: 'string',
          enum: ['unauthenticated', 'forbidden', 'invalid-argument', 'not-found', 'no-citizenship', 'internal'],
        },
        message: { type: 'string', description: 'Human readable, safe to show or repeat to the user' },
      },
    },
  },
};

const err = (status: number, code: string, message: string) => ({
  description: message,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { error: { code, message } } } },
});

const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };

const trip = {
  type: 'object',
  description: 'One tracked stay in one city. The timeline is the list of these, in date order, with no gaps while tracking runs.',
  required: ['id', 'city', 'country', 'country_code', 'start_date', 'end_date', 'days'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    city: { type: 'string', example: 'Chiang Mai' },
    country: { type: 'string', example: 'Thailand' },
    country_code: countryCode,
    start_date: date,
    end_date: { ...orNull(date), description: 'null while the stay is still going on (only the newest stay can be open)' },
    days: { type: 'integer', minimum: 1, description: 'Calendar days, first and last day both counted', example: 10 },
  },
};

const stayInput = {
  type: 'object',
  description: 'A past stay to add. Give the country by name or code. Both dates are required: an open stay belongs to the tracker.',
  required: ['city', 'start_date', 'end_date'],
  properties: {
    city: { type: 'string', maxLength: 80, example: 'Chiang Mai' },
    country: { type: 'string', description: 'Country name in English; alternative to country_code', example: 'Thailand' },
    country_code: countryCode,
    start_date: { ...date, description: 'First day. Cannot be in the future; future travel is a journey.' },
    end_date: { ...date, description: 'Last day, inclusive' },
  },
};

const stop = {
  type: 'object',
  required: ['id', 'city', 'country', 'country_code', 'start_date', 'end_date', 'transport'],
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Stable across edits: reuse it by sending the same city and country in a PATCH' },
    city: { type: 'string', example: 'Hanoi' },
    country: { type: 'string', example: 'Vietnam' },
    country_code: countryCode,
    start_date: date,
    end_date: date,
    transport: { type: 'string', enum: [...TRANSPORTS], description: 'How the traveller gets to this stop' },
    notes: { type: ['string', 'null'] },
    accommodation: {
      oneOf: [{ $ref: '#/components/schemas/AccommodationSummary' }, { type: 'null' }],
      description: 'The stop\'s accommodation plan in one line, null when none has been started',
    },
  },
};

const stopInput = {
  type: 'object',
  required: ['city'],
  description: 'A planned stop. Only the first stop needs a start_date; every later stop starts the day after the previous one ends. Each stop needs either days or end_date.',
  properties: {
    city: { type: 'string', maxLength: 80, example: 'Hanoi' },
    country: { type: 'string', description: 'Country name in English; alternative to country_code', example: 'Vietnam' },
    country_code: countryCode,
    start_date: { ...date, description: 'Only read on the first stop (today when omitted). Later stops chain.' },
    end_date: { ...date, description: 'Last day of the stop, inclusive. Alternative to days.' },
    days: { type: 'integer', minimum: 1, maximum: 365, description: 'Length of the stop. Alternative to end_date.', example: 4 },
    transport: { type: 'string', enum: [...TRANSPORTS], default: 'flight' },
    notes: { type: 'string', maxLength: 500 },
  },
};

const journey = {
  type: 'object',
  required: ['id', 'title', 'updated_at', 'start_date', 'end_date', 'stops', 'travellers'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    title: { type: 'string', example: 'Vietnam' },
    updated_at: { type: ['string', 'null'], format: 'date-time' },
    start_date: { ...orNull(date), description: 'First day of the first stop' },
    end_date: { ...orNull(date), description: 'Last day of the last stop' },
    stops: { type: 'array', items: { $ref: '#/components/schemas/Stop' } },
    travellers: { type: 'array', items: { type: 'string' }, description: 'Names; the owner is "You"', example: ['You', 'Alice'] },
  },
};

// ─── Accommodation ───────────────────────────────────────────────────────────

const money = (description: string) => ({ type: ['number', 'null'], minimum: 0, description: `${description}. Two decimals; needs a currency beside it.` });
const currency = { type: ['string', 'null'], pattern: '^[A-Z]{3}$', description: 'ISO 4217, upper case', example: 'THB' };
const text = (max: number, description?: string) => ({ type: ['string', 'null'], maxLength: max, ...(description && { description }) });
const words = (description: string, max = 20) => ({ type: 'array', items: { type: 'string', maxLength: 60 }, maxItems: max, description: `${description}. Lower-cased and de-duplicated; may also be sent as one comma-separated string.` });

const accommodationStatus = {
  type: 'string',
  enum: [...ACCOMMODATION_STATUSES],
  description: [
    'Where the plan stands. Moves forward on its own when something happens (an option is added: options_available; one is selected: selected; a booking is saved: booked) and can be set by hand any time with PUT …/status.',
    'open: nothing done yet. searching: looking for places. options_available: at least one option saved. deciding: the user is choosing. selected: one option picked, not booked. booked: booking details saved. checked_in, completed: the stay itself. cancelled: sticks until set to something else.',
  ].join(' '),
};

const accommodationRequirements = {
  type: 'object',
  description: 'What the place should be like. Every field is optional; absent keeps the current value, null clears it.',
  properties: {
    type: { type: ['string', 'null'], enum: [...ACCOMMODATION_TYPES, null] },
    budget_per_night: money('Ceiling per night'),
    budget_total: money('Ceiling for the whole stay'),
    currency: { ...currency, description: 'ISO 4217 for both budgets. Required when either budget is given.' },
    areas: words('Neighbourhoods or areas to look in', 10),
    min_requirements: text(500, 'Must-haves in words: "private bathroom, no ground floor"'),
    work_requirements: text(500, 'What working from there needs: "stable wifi 50 Mbit, quiet, a desk"'),
    amenities: words('Wanted amenities. The app knows wifi, desk, quiet, ac, kitchen, washer, gym, pool, balcony, parking, breakfast; other words are kept as given'),
    dates_flexible: { type: 'boolean', default: false, description: 'true when a day either side is fine' },
    notes: text(1000),
  },
};

const accommodationOption = {
  type: 'object',
  description: 'One place that was found. Prices are as seen on the platform; say when you looked (last_checked_at), they move.',
  required: ['id', 'name', 'check_in', 'check_out', 'rating_scale', 'amenities', 'sort_order'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', maxLength: 120, example: 'Loft in Tay Ho' },
    platform: text(40, 'Where it was found'),
    url: { type: ['string', 'null'], format: 'uri', description: 'http(s) link to the listing' },
    address: text(200, 'Address or area'),
    check_in: { ...date, description: 'Defaults to the plan\'s check_in' },
    check_out: { ...date, description: 'Defaults to the plan\'s check_out; must be after check_in' },
    total_price: money('For the whole stay, fees included if the platform shows it that way'),
    price_per_night: money('Per night'),
    currency: { ...currency, description: 'ISO 4217 for every price on this option. Required when any price is given.' },
    fees: money('Cleaning and service fees on top, when shown separately'),
    rating: { type: ['number', 'null'], minimum: 0, description: 'The platform\'s rating, on rating_scale' },
    rating_scale: { type: 'integer', enum: [5, 10], default: 5, description: '5 for Airbnb and Google, 10 for Booking.com and Agoda. Send it with a rating above 5.' },
    review_count: { type: ['integer', 'null'], minimum: 0 },
    cancellation_policy: text(300, 'In words: "free until 3 days before"'),
    amenities: words('What the listing has'),
    score: { type: ['number', 'null'], minimum: 0, maximum: 10, description: 'Your own verdict, 0 to 10, one decimal' },
    risks: text(500, 'What could go wrong: construction, far from transport, few reviews'),
    notes: text(1000),
    last_checked_at: { type: ['string', 'null'], format: 'date-time', description: 'When the listing was last looked at' },
    sort_order: { type: 'integer', description: 'Position in the list, from 0' },
  },
};

const accommodationOptionInput = {
  ...accommodationOption,
  description: 'An option to save or the fields of one to change. Only name is required on a new one; absent fields keep their value on a PATCH, null clears them. Free text must not contain payment card numbers.',
  required: ['name'],
  properties: Object.fromEntries(Object.entries(accommodationOption.properties).filter(([k]) => k !== 'id' && k !== 'sort_order')),
};

const accommodationBooking = {
  type: 'object',
  description: 'What was booked, for the door and the desk. No payment details: card numbers are refused, and there is no field for a password or a login.',
  properties: {
    option_id: { type: ['string', 'null'], format: 'uuid', description: 'The option that was booked. Defaults to the selected option when the booking is first saved.' },
    booking_url: { type: ['string', 'null'], format: 'uri', description: 'Link to the reservation on the platform' },
    booking_reference: text(80, 'Confirmation number'),
    price: money('What was actually paid or is due'),
    currency: { ...currency, description: 'Required when price is given' },
    address: text(300),
    check_in_info: text(1000, 'How to get in: times, codes, where the key is'),
    check_out_info: text(1000),
    deposit: money('Security deposit'),
    deposit_currency: { ...currency, description: 'Defaults to currency' },
    provider_contact: text(300, 'Host or reception: name, phone, messenger'),
    notes: text(1000),
    review_rating: { type: ['number', 'null'], minimum: 0, maximum: 5, description: 'Your rating after the stay, 0 to 5' },
    review_text: text(2000, 'Your review after the stay'),
  },
};

const stopRef = {
  type: 'object',
  description: 'The stop this plan belongs to, as it is now',
  required: ['id', 'city', 'country', 'country_code', 'start_date', 'end_date'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    city: { type: 'string' },
    country: { type: 'string' },
    country_code: countryCode,
    start_date: date,
    end_date: date,
  },
};

const accommodation = {
  type: 'object',
  description: 'The accommodation plan of one stop: whether a place is needed, what it should be like, the options found, the pick and the booking. Planning only: it is never a stay in the timeline.',
  required: ['id', 'journey_id', 'journey_title', 'stop_id', 'stop', 'needed', 'status', 'check_in', 'check_out', 'nights', 'dates_match_stop', 'requirements', 'options', 'selected_option_id', 'booking', 'notes', 'updated_at'],
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Same as stop_id: a stop has at most one plan' },
    journey_id: { type: 'string', format: 'uuid' },
    journey_title: { type: 'string' },
    stop_id: { type: 'string', format: 'uuid' },
    stop: stopRef,
    needed: { type: 'boolean', description: 'false when the user has a place already (friends, own flat) and wants no search' },
    status: { $ref: '#/components/schemas/AccommodationStatus' },
    check_in: { ...date, description: 'First night. Defaults to the stop\'s start_date.' },
    check_out: { ...date, description: 'Morning of departure. Defaults to the day after the stop\'s end_date, so nights equal the stop\'s days.' },
    nights: { type: 'integer', minimum: 1 },
    dates_match_stop: { type: 'boolean', description: 'false when the stop was moved or resized after the plan was made. The plan keeps its own dates; tell the user rather than moving a booking.' },
    requirements: { $ref: '#/components/schemas/AccommodationRequirements' },
    options: { type: 'array', maxItems: MAX_OPTIONS, items: { $ref: '#/components/schemas/AccommodationOption' } },
    selected_option_id: { type: ['string', 'null'], format: 'uuid' },
    booking: { oneOf: [{ $ref: '#/components/schemas/AccommodationBooking' }, { type: 'null' }] },
    notes: { type: ['string', 'null'], maxLength: 2000, description: 'Notes on the plan as a whole' },
    updated_at: { type: ['string', 'null'], format: 'date-time' },
  },
};

const accommodationInput = {
  type: 'object',
  description: 'Fields of the plan to set. All optional; absent keeps, null clears. Options and booking have their own routes.',
  properties: {
    needed: { type: 'boolean', default: true },
    status: { $ref: '#/components/schemas/AccommodationStatus' },
    check_in: { ...date, description: 'Must be a real day. Defaults to the stop\'s start_date on creation.' },
    check_out: { ...date, description: 'Must be after check_in. Defaults to the day after the stop\'s end_date on creation.' },
    requirements: { $ref: '#/components/schemas/AccommodationRequirements' },
    notes: { type: ['string', 'null'], maxLength: 2000 },
  },
};

const accommodationSummary = {
  type: 'object',
  description: 'A plan in one line, attached to every stop of a journey',
  required: ['status', 'needed', 'check_in', 'check_out', 'nights', 'options', 'selected', 'booked'],
  properties: {
    status: { $ref: '#/components/schemas/AccommodationStatus' },
    needed: { type: 'boolean' },
    check_in: date,
    check_out: date,
    nights: { type: 'integer' },
    options: { type: 'integer', description: 'How many options are saved' },
    selected: { type: ['string', 'null'], description: 'Name of the selected or booked option' },
    booked: { type: 'boolean' },
  },
};

const accommodationExample = {
  id: '3c1f2a9e-7d4b-4e0a-9b6f-1e2d3c4b5a60',
  journey_id: 'a1b2c3d4-0000-4000-8000-000000000001',
  journey_title: 'Vietnam',
  stop_id: '3c1f2a9e-7d4b-4e0a-9b6f-1e2d3c4b5a60',
  stop: { id: '3c1f2a9e-7d4b-4e0a-9b6f-1e2d3c4b5a60', city: 'Hanoi', country: 'Vietnam', country_code: 'VN', start_date: '2026-11-01', end_date: '2026-11-04' },
  needed: true,
  status: 'selected',
  check_in: '2026-11-01',
  check_out: '2026-11-05',
  nights: 4,
  dates_match_stop: true,
  requirements: { type: 'apartment', budget_per_night: 40, budget_total: null, currency: 'USD', areas: ['tay ho', 'old quarter'], min_requirements: 'private bathroom', work_requirements: 'stable wifi, quiet, a desk', amenities: ['wifi', 'desk', 'ac'], dates_flexible: false, notes: null },
  options: [
    { id: '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f', name: 'Loft in Tay Ho', platform: 'Airbnb', url: 'https://www.airbnb.com/rooms/1', address: 'Tay Ho, Hanoi', check_in: '2026-11-01', check_out: '2026-11-05', total_price: 152, price_per_night: 38, currency: 'USD', fees: 18, rating: 4.9, rating_scale: 5, review_count: 88, cancellation_policy: 'free until 3 days before', amenities: ['wifi', 'desk', 'ac', 'kitchen'], score: 8.5, risks: 'no reviews from the last 6 months', notes: 'host replies within an hour', last_checked_at: '2026-09-18T10:00:00.000Z', sort_order: 0 },
  ],
  selected_option_id: '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f',
  booking: null,
  notes: 'ask about late check-in',
  updated_at: '2026-09-18T10:05:00.000Z',
};

const stopIdParam = { name: 'stopId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'The stop\'s id from the journey' };
const optionIdParam = { name: 'optionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
/** The full example lives once under components.examples; every plan response points at it. */
const accommodationOk = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Accommodation' }, examples: { plan: { $ref: '#/components/examples/Accommodation' } } } },
});
const accommodationErrors = { 400: { $ref: '#/components/responses/BadRequest' }, 401: { $ref: '#/components/responses/Unauthorized' }, 404: { $ref: '#/components/responses/NotFound' } };

const visaStatus = {
  type: 'object',
  description: 'How much of a visa allowance is used. From the built-in visa rules for the citizenship, or from a visa the user entered.',
  required: ['destination', 'destinationCode', 'ruleLabel', 'daysAllowed', 'daysUsed', 'daysRemaining', 'percentUsed', 'status'],
  properties: {
    destination: { type: 'string', example: 'Thailand' },
    destinationCode: countryCode,
    flag: { type: 'string', example: '🇹🇭' },
    ruleLabel: { type: 'string', description: 'The rule in words', example: '60 days visa exempt' },
    daysAllowed: { type: 'integer' },
    daysUsed: { type: 'integer' },
    daysRemaining: { type: 'integer' },
    percentUsed: { type: 'number' },
    status: { type: 'string', enum: ['ok', 'warning', 'critical', 'exceeded', 'visa_needed', 'expired'] },
    usagePeriod: { type: 'string', description: 'The stay or year the count belongs to' },
    isUserVisa: { type: 'boolean', description: 'true when the rule is a visa the user typed in' },
    validUntil: { ...date, description: 'User visas only: expiry' },
    lastStayDays: { type: 'integer', description: 'Per-stay rules only: length of the most recent finished stay' },
    leftOn: { ...date, description: 'Per-stay rules only: the day that stay ended' },
    source: { type: 'string', format: 'uri', description: 'Where the built-in rule can be checked' },
    lastVerified: { ...date, description: 'When the built-in rule was last audited' },
  },
};

const taxStatus = {
  type: 'object',
  description: 'Days present in a country against its tax residency threshold, counted over that country\'s tax year: the calendar year for most, 6 April to 5 April for GB, 1 July to 30 June for AU, the busiest 12-month window for NZ.',
  required: ['country', 'countryCode', 'ruleLabel', 'thresholdDays', 'daysPresent', 'daysRemaining', 'percentUsed', 'year', 'periodStart', 'periodEnd', 'periodKind', 'status'],
  properties: {
    country: { type: 'string', example: 'Thailand' },
    countryCode: countryCode,
    flag: { type: 'string' },
    ruleLabel: { type: 'string', example: '183 days in the 2026/27 tax year (Apr 6 to Apr 5)' },
    thresholdDays: { type: 'integer', example: 183 },
    daysPresent: { type: 'integer' },
    daysRemaining: { type: 'integer' },
    percentUsed: { type: 'number' },
    year: { type: 'integer', example: 2026, description: 'The year asked for; which days that covers is in periodStart and periodEnd.' },
    periodStart: { type: 'string', format: 'date', example: '2026-04-06', description: 'First day counted.' },
    periodEnd: { type: 'string', format: 'date', example: '2027-04-05', description: 'Last day counted.' },
    periodKind: { type: 'string', enum: ['year', 'rolling'], description: 'A fixed tax year, or any window of that length (NZ).' },
    status: { type: 'string', enum: ['safe', 'caution', 'warning', 'resident'] },
  },
};

const stats = {
  type: 'object',
  required: ['totalCountries', 'totalCities', 'daysAway', 'daysTracked', 'daysInWindow', 'stops', 'avgStayDays', 'newCountries', 'topCountries', 'availableYears', 'allTimeCountryCodes', 'daysAwayByMonth'],
  properties: {
    totalCountries: { type: 'integer', description: 'Countries with at least one day in the window' },
    totalCities: { type: 'integer' },
    daysAway: { type: 'integer', description: 'Distinct days outside the home country. The headline number.' },
    daysTracked: { type: 'integer', description: 'Days with a known location' },
    daysInWindow: { type: 'integer', description: 'Days the window spans so far' },
    stops: { type: 'integer', description: 'Separate stays in the window' },
    avgStayDays: { type: 'number' },
    newCountries: { type: 'integer', description: 'Countries first visited inside the window' },
    topCountries: {
      type: 'array',
      items: { type: 'object', properties: { country: { type: 'string' }, country_code: countryCode, days: { type: 'integer' } } },
      description: 'Distinct days per country, biggest first',
    },
    availableYears: { type: 'array', items: { type: 'integer' } },
    allTimeCountryCodes: { type: 'array', items: countryCode },
    daysAwayByMonth: { type: ['array', 'null'], items: { type: 'integer' }, minItems: 12, maxItems: 12, description: 'Twelve buckets for a year, null for all time' },
  },
};

const citizenship = {
  type: ['object', 'null'],
  description: 'null until the user has finished onboarding; /visa and /tax then answer 409.',
  properties: { country: { type: 'string', example: 'Germany' }, countryCode: countryCode },
};

const auth = { security: [{ bearer: [] }] };
const json = (schema: unknown, example?: unknown) => ({ 'application/json': { schema, ...(example !== undefined && { example }) } });

export function openapi() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Nomadu agent API',
      version: '1.2.0',
      contact: { name: 'Nomadu', url: 'https://nomadu.app' },
      summary: 'A traveller\'s timeline, visa and tax standing, and plans, for an AI agent acting on their behalf.',
      description: [
        'Nomadu tracks where its user is, day by day, and works out visa allowances and tax residency from that. This API gives an agent the same data and numbers the app shows, plus the ability to plan trips and, when the user allows it, to correct the timeline.',
        '',
        '## Authentication',
        'Every request except this spec and `/docs` needs `Authorization: Bearer nmd_…`. The user creates the token in the app (Settings, AI agent) and decides at that moment whether the token may edit the timeline. A token that may not gets `403 forbidden` on `POST /trips`, `PATCH /trips/{id}` and `DELETE /trips/{id}`; everything else works for every token. A revoked token answers `401`.',
        '',
        '## Conventions',
        'All bodies are JSON. Dates are calendar days as `YYYY-MM-DD` in the user\'s local reckoning; there are no times. Days are counted inclusively: a stay from the 1st to the 3rd is 3 days. Countries can be given by English name or by ISO code; unknown countries are rejected, not guessed. Errors are `{"error": {"code", "message"}}`.',
        '',
        '## Two kinds of travel',
        '**Stays** (`/trips`) are the past: where the user actually was, recorded by the phone. **Journeys** (`/journeys`) are plans: a title and a chain of stops with dates. A stay cannot start in the future and a plan is never counted as presence. When the user says "I am going to Hanoi next month", that is a journey; "I was in Hanoi last month and the app missed it", that is a stay.',
        '',
        '## Accommodation',
        'Every planned stop can carry one accommodation plan (`/journeys/{id}/stops/{stopId}/accommodation`): whether a place is needed, what it should be like, the options that were found, the one that was picked and, once booked, the booking details. You research on the platforms yourself and save what you found here; Nomadu never searches or books anything. A plan is planning only: it never becomes a stay in the timeline and never changes visa or tax numbers. Check-in and check-out are stored on the plan and validated; when a stop is later moved, the plan keeps its dates and reports `dates_match_stop: false`, so ask the user before changing a booking. Every token may read and write plans, the same as journeys. `GET /accommodations?status=searching` lists the stops that still need a place; every stop in `/journeys` carries a one-line summary of its plan.',
        '',
        '## What the app does with your writes',
        'Everything you create or change syncs to the user\'s phone within seconds while the app is open, or on its next start. Tell the user when you have written something. Deleting is soft: the record is tombstoned and disappears from the app.',
      ].join('\n'),
    },
    servers: [{ url: API_BASE }],
    tags: [
      { name: 'Profile', description: 'Who the user is' },
      { name: 'Timeline', description: 'Where the user has been' },
      { name: 'Insights', description: 'Numbers derived from the timeline' },
      { name: 'Plans', description: 'Trips the user is planning' },
      { name: 'Accommodation', description: 'Where to stay at each planned stop: requirements, options found, the pick, the booking' },
      { name: 'Meta', description: 'This document' },
    ],
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'nmd_ token from the Nomadu app' },
      },
      schemas: {
        Error: errorSchema,
        Citizenship: citizenship,
        Trip: trip,
        StayInput: stayInput,
        Stop: stop,
        StopInput: stopInput,
        Journey: journey,
        VisaStatus: visaStatus,
        TaxStatus: taxStatus,
        Stats: stats,
        AccommodationStatus: accommodationStatus,
        AccommodationRequirements: accommodationRequirements,
        AccommodationOption: accommodationOption,
        AccommodationOptionInput: accommodationOptionInput,
        AccommodationBooking: accommodationBooking,
        Accommodation: accommodation,
        AccommodationInput: accommodationInput,
        AccommodationSummary: accommodationSummary,
      },
      examples: {
        Accommodation: { summary: 'A plan with one option, selected, not yet booked', value: accommodationExample },
      },
      responses: {
        Unauthorized: err(401, 'unauthenticated', 'Unknown or revoked token.'),
        Forbidden: err(403, 'forbidden', 'This key can only read the timeline. Ask the user for a key that may edit it.'),
        NotFound: err(404, 'not-found', 'No such stay.'),
        BadRequest: err(400, 'invalid-argument', '"end_date" is before "start_date".'),
        NoCitizenship: err(409, 'no-citizenship', 'Set your citizenship in the app first.'),
      },
    },
    paths: {
      '/me': {
        get: {
          ...auth,
          tags: ['Profile'],
          operationId: 'getMe',
          summary: 'Profile and counts',
          description: 'Citizenship and residence drive the visa and tax numbers. The counts tell you how much history there is before you ask for it.',
          responses: {
            200: {
              description: 'OK',
              content: json({
                type: 'object',
                required: ['citizenship', 'has_fixed_residence', 'trips', 'journeys', 'first_trip'],
                properties: {
                  citizenship: { $ref: '#/components/schemas/Citizenship' },
                  has_fixed_residence: { type: ['boolean', 'null'], description: 'Whether the user keeps a home to return to; changes the tax rules applied' },
                  trips: { type: 'integer', description: 'Tracked stays' },
                  journeys: { type: 'integer', description: 'Plans' },
                  first_trip: { ...orNull(date), description: 'Start of the oldest stay' },
                },
              }, { citizenship: { country: 'Germany', countryCode: 'DE' }, has_fixed_residence: false, trips: 240, journeys: 2, first_trip: '2021-03-04' }),
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/trips': {
        get: {
          ...auth,
          tags: ['Timeline'],
          operationId: 'listTrips',
          summary: 'Where the user has been',
          description: 'One entry per stay, oldest first. Without filters the whole history comes back; for "where was I in March" use both filters on that month.',
          parameters: [
            { name: 'from', in: 'query', schema: date, description: 'Only stays that end on or after this day (open stays always match)' },
            { name: 'to', in: 'query', schema: date, description: 'Only stays that start on or before this day' },
          ],
          responses: {
            200: {
              description: 'OK',
              content: json({ type: 'object', required: ['trips'], properties: { trips: { type: 'array', items: { $ref: '#/components/schemas/Trip' } } } }, {
                trips: [
                  { id: '2f1c9d8e-4b7a-4c3e-9f21-0a6d5e8b7c11', city: 'Phuket', country: 'Thailand', country_code: 'TH', start_date: '2026-08-15', end_date: '2026-09-12', days: 29 },
                  { id: '9a0e6f2b-1d5c-4e8a-b3f7-2c4d6e8f0a13', city: 'Kuala Lumpur', country: 'Malaysia', country_code: 'MY', start_date: '2026-09-12', end_date: null, days: 7 },
                ],
              }),
            },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
        post: {
          ...auth,
          tags: ['Timeline'],
          operationId: 'addTrip',
          summary: 'Add a past stay the tracker missed',
          description: 'Needs a token that may edit the timeline. Confirm the exact dates with the user first: the stay changes their visa and tax counts the moment it exists. Coordinates are looked up from the city name, so use the common English name.',
          requestBody: { required: true, content: json({ $ref: '#/components/schemas/StayInput' }, { city: 'Chiang Mai', country: 'Thailand', start_date: '2026-06-01', end_date: '2026-06-10' }) },
          responses: {
            201: { description: 'Created', content: json({ $ref: '#/components/schemas/Trip' }) },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
          },
        },
      },
      '/trips/{id}': {
        parameters: [idParam],
        get: {
          ...auth, tags: ['Timeline'], operationId: 'getTrip', summary: 'One stay',
          responses: { 200: { description: 'OK', content: json({ $ref: '#/components/schemas/Trip' }) }, 401: { $ref: '#/components/responses/Unauthorized' }, 404: { $ref: '#/components/responses/NotFound' } },
        },
        patch: {
          ...auth,
          tags: ['Timeline'],
          operationId: 'updateTrip',
          summary: 'Correct a stay',
          description: 'Needs a token that may edit the timeline. Send only what changes: one or both dates, or the place (city with country or country_code). Days are recounted.',
          requestBody: { required: true, content: json({ ...stayInput, required: [] }, { end_date: '2026-06-12' }) },
          responses: {
            200: { description: 'Updated', content: json({ $ref: '#/components/schemas/Trip' }) },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
        delete: {
          ...auth,
          tags: ['Timeline'],
          operationId: 'deleteTrip',
          summary: 'Remove a stay that never happened',
          description: 'Needs a token that may edit the timeline. Ask the user before deleting; there is no undo from your side.',
          responses: {
            200: { description: 'Removed', content: json({ type: 'object', properties: { ok: { type: 'boolean' } } }, { ok: true }) },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/stats': {
        get: {
          ...auth,
          tags: ['Insights'],
          operationId: 'getStats',
          summary: 'Days away, countries, cities, stops',
          description: 'For one calendar year, or all time without `year`. "Days away" counts distinct days outside the home country and is the number the app leads with.',
          parameters: [{ name: 'year', in: 'query', schema: { type: 'integer', example: 2026 } }],
          responses: { 200: { description: 'OK', content: json({ $ref: '#/components/schemas/Stats' }) }, 400: { $ref: '#/components/responses/BadRequest' }, 401: { $ref: '#/components/responses/Unauthorized' } },
        },
      },
      '/visa': {
        get: {
          ...auth,
          tags: ['Insights'],
          operationId: 'getVisa',
          summary: 'Visa standing per destination',
          description: 'For every country the user has been to: the rule that applies to their citizenship (or a visa they entered), and how much of it is used. `daysRemaining` is what "how long can I still stay" means.',
          responses: {
            200: {
              description: 'OK',
              content: json({ type: 'object', required: ['citizenship', 'statuses'], properties: { citizenship: { $ref: '#/components/schemas/Citizenship' }, statuses: { type: 'array', items: { $ref: '#/components/schemas/VisaStatus' } } } }),
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            409: { $ref: '#/components/responses/NoCitizenship' },
          },
        },
      },
      '/tax': {
        get: {
          ...auth,
          tags: ['Insights'],
          operationId: 'getTax',
          summary: 'Tax residency exposure per country',
          description: 'Days present against each country\'s residency threshold, each over its own tax year (see TaxStatus). `resident` means the threshold is reached.',
          responses: {
            200: {
              description: 'OK',
              content: json({ type: 'object', required: ['citizenship', 'statuses'], properties: { citizenship: { $ref: '#/components/schemas/Citizenship' }, statuses: { type: 'array', items: { $ref: '#/components/schemas/TaxStatus' } } } }),
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            409: { $ref: '#/components/responses/NoCitizenship' },
          },
        },
      },
      '/journeys': {
        get: {
          ...auth, tags: ['Plans'], operationId: 'listJourneys', summary: 'All plans with their stops',
          responses: { 200: { description: 'OK', content: json({ type: 'object', required: ['journeys'], properties: { journeys: { type: 'array', items: { $ref: '#/components/schemas/Journey' } } } }) }, 401: { $ref: '#/components/responses/Unauthorized' } },
        },
        post: {
          ...auth,
          tags: ['Plans'],
          operationId: 'createJourney',
          summary: 'Create a plan',
          description: 'A title and one to sixty stops. Stops chain: give the first a start_date and every stop either days or end_date, and the dates of the rest follow. The plan appears in the app with the user as its only traveller.',
          requestBody: {
            required: true,
            content: json(
              { type: 'object', required: ['title', 'stops'], properties: { title: { type: 'string', maxLength: 80 }, stops: { type: 'array', minItems: 1, maxItems: 60, items: { $ref: '#/components/schemas/StopInput' } } } },
              {
                title: 'Vietnam',
                stops: [
                  { city: 'Hanoi', country: 'Vietnam', start_date: '2026-11-01', days: 4 },
                  { city: 'Da Nang', country: 'Vietnam', days: 3, transport: 'train' },
                  { city: 'Ho Chi Minh City', country_code: 'VN', end_date: '2026-11-14' },
                ],
              },
            ),
          },
          responses: {
            201: { description: 'Created', content: json({ $ref: '#/components/schemas/Journey' }) },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/journeys/{id}': {
        parameters: [idParam],
        get: {
          ...auth, tags: ['Plans'], operationId: 'getJourney', summary: 'One plan',
          responses: { 200: { description: 'OK', content: json({ $ref: '#/components/schemas/Journey' }) }, 401: { $ref: '#/components/responses/Unauthorized' }, 404: { $ref: '#/components/responses/NotFound' } },
        },
        patch: {
          ...auth,
          tags: ['Plans'],
          operationId: 'updateJourney',
          summary: 'Rename a plan or replace its stops',
          description: 'Send `title`, `stops`, or both. `stops` replaces the whole list; a stop with the same city and country as before keeps its id and, with it, its accommodation plan. A stop that is dropped takes its plan with it. Ask the user before replacing stops they arranged by hand.',
          requestBody: { required: true, content: json({ type: 'object', properties: { title: { type: 'string', maxLength: 80 }, stops: { type: 'array', minItems: 1, maxItems: 60, items: { $ref: '#/components/schemas/StopInput' } } } }) },
          responses: {
            200: { description: 'Updated', content: json({ $ref: '#/components/schemas/Journey' }) },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
        delete: {
          ...auth, tags: ['Plans'], operationId: 'deleteJourney', summary: 'Delete a plan',
          description: 'Ask the user first. The accommodation plans of its stops go with it.',
          responses: {
            200: { description: 'Deleted', content: json({ type: 'object', properties: { ok: { type: 'boolean' } } }, { ok: true }) },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/accommodations': {
        get: {
          ...auth,
          tags: ['Accommodation'],
          operationId: 'listAccommodations',
          summary: 'Every accommodation plan, with its stop',
          description: 'Across all journeys, in check-in order. Plans whose stop no longer exists are left out. Start here for "which stops still need a place": filter by status.',
          parameters: [
            { name: 'journey_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/AccommodationStatus' } },
          ],
          responses: {
            200: { description: 'OK', content: json({ type: 'object', required: ['accommodations'], properties: { accommodations: { type: 'array', items: { $ref: '#/components/schemas/Accommodation' } } } }) },
            400: { $ref: '#/components/responses/BadRequest' },
            401: { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/journeys/{id}/stops/{stopId}/accommodation': {
        parameters: [idParam, stopIdParam],
        get: {
          ...auth, tags: ['Accommodation'], operationId: 'getAccommodation', summary: 'The plan of one stop',
          description: '404 when nothing has been planned for this stop yet; `PUT` creates it. Notes live here too: `notes` on the plan, `requirements.notes`, and `risks` and `notes` on every option.',
          responses: { 200: accommodationOk('OK'), 401: { $ref: '#/components/responses/Unauthorized' }, 404: { $ref: '#/components/responses/NotFound' } },
        },
        put: {
          ...auth,
          tags: ['Accommodation'],
          operationId: 'putAccommodation',
          summary: 'Create the plan or change its requirements',
          description: 'Creates the plan when there is none (201) and updates it otherwise (200). Send only what you know; absent fields keep their value, null clears. Options and the booking are not touched here. Dates default from the stop; a budget needs a currency. PATCH does the same.',
          requestBody: { required: true, content: json({ $ref: '#/components/schemas/AccommodationInput' }, { needed: true, requirements: { type: 'apartment', budget_per_night: 40, currency: 'USD', areas: ['Tay Ho', 'Old Quarter'], work_requirements: 'stable wifi, quiet, a desk', amenities: ['wifi', 'desk', 'ac'] } }) },
          responses: { 200: accommodationOk('Updated'), 201: accommodationOk('Created'), ...accommodationErrors },
        },
        patch: {
          ...auth, tags: ['Accommodation'], operationId: 'patchAccommodation', summary: 'Same as PUT',
          requestBody: { required: true, content: json({ $ref: '#/components/schemas/AccommodationInput' }, { notes: 'ask about late check-in' }) },
          responses: { 200: accommodationOk('Updated'), 201: accommodationOk('Created'), ...accommodationErrors },
        },
        delete: {
          ...auth, tags: ['Accommodation'], operationId: 'deleteAccommodation', summary: 'Drop the plan',
          description: 'Removes the plan with its options and booking from the stop. Ask the user first. For "no place needed" set `needed: false` instead.',
          responses: { 200: { description: 'Deleted', content: json({ type: 'object', properties: { ok: { type: 'boolean' } } }, { ok: true }) }, 401: { $ref: '#/components/responses/Unauthorized' }, 404: { $ref: '#/components/responses/NotFound' } },
        },
      },
      '/journeys/{id}/stops/{stopId}/accommodation/options': {
        parameters: [idParam, stopIdParam],
        post: {
          ...auth,
          tags: ['Accommodation'],
          operationId: 'addAccommodationOption',
          summary: 'Save a place you found',
          description: `Creates the plan too when there is none, so research can start before the requirements are written down. At most ${MAX_OPTIONS} options per stop. A plan that was open or searching becomes options_available. Prices need a currency; a rating above 5 needs rating_scale: 10. Say when you looked (last_checked_at).`,
          requestBody: { required: true, content: json({ $ref: '#/components/schemas/AccommodationOptionInput' }, { name: 'Loft in Tay Ho', platform: 'Airbnb', url: 'https://www.airbnb.com/rooms/1', total_price: 152, price_per_night: 38, fees: 18, currency: 'USD', rating: 4.9, review_count: 88, cancellation_policy: 'free until 3 days before', amenities: ['wifi', 'desk', 'ac', 'kitchen'], score: 8.5, risks: 'no reviews from the last 6 months', last_checked_at: '2026-09-18T10:00:00Z' }) },
          responses: { 201: accommodationOk('Saved; the whole plan comes back with the new option in `options`'), ...accommodationErrors },
        },
      },
      '/journeys/{id}/stops/{stopId}/accommodation/options/{optionId}': {
        parameters: [idParam, stopIdParam, optionIdParam],
        patch: {
          ...auth, tags: ['Accommodation'], operationId: 'updateAccommodationOption', summary: 'Change an option',
          description: 'Send only what changed: a new price with last_checked_at, a score, a risk you noticed. PUT does the same.',
          requestBody: { required: true, content: json({ ...accommodationOptionInput, required: [] }, { total_price: 140, last_checked_at: '2026-09-19T08:00:00Z' }) },
          responses: { 200: accommodationOk('Updated'), ...accommodationErrors },
        },
        delete: {
          ...auth, tags: ['Accommodation'], operationId: 'removeAccommodationOption', summary: 'Remove an option',
          description: 'If it was the selected one, the plan goes back to options_available (or searching when none is left). A booking that pointed at it keeps its details.',
          responses: { 200: accommodationOk('Removed'), 401: { $ref: '#/components/responses/Unauthorized' }, 404: { $ref: '#/components/responses/NotFound' } },
        },
      },
      '/journeys/{id}/stops/{stopId}/accommodation/options/{optionId}/select': {
        parameters: [idParam, stopIdParam, optionIdParam],
        post: {
          ...auth, tags: ['Accommodation'], operationId: 'selectAccommodationOption', summary: 'Pick this option',
          description: 'Marks it as the one to book and moves the plan to selected (a booked plan keeps its status). Only after the user has chosen; do not pick for them.',
          responses: { 200: accommodationOk('Selected'), 401: { $ref: '#/components/responses/Unauthorized' }, 404: { $ref: '#/components/responses/NotFound' } },
        },
      },
      '/journeys/{id}/stops/{stopId}/accommodation/booking': {
        parameters: [idParam, stopIdParam],
        put: {
          ...auth,
          tags: ['Accommodation'],
          operationId: 'putAccommodationBooking',
          summary: 'Save the booking',
          description: 'After the user has booked on the platform. Links to the selected option unless option_id says otherwise, and moves the plan to booked. Absent fields keep their value, so the check-in code can be added later. Never store payment details: card numbers are refused. PATCH does the same.',
          requestBody: { required: true, content: json({ $ref: '#/components/schemas/AccommodationBooking' }, { booking_reference: 'HMX4K2', booking_url: 'https://www.airbnb.com/trips/1', price: 152, currency: 'USD', check_in_info: 'Self check-in from 15:00, lockbox code comes by message the day before', provider_contact: 'Linh, +84 90 000 0000' }) },
          responses: { 200: accommodationOk('Saved'), ...accommodationErrors },
        },
        delete: {
          ...auth, tags: ['Accommodation'], operationId: 'clearAccommodationBooking', summary: 'Forget the booking details',
          description: 'For a booking that was cancelled on the platform. The plan goes back to selected or the options. To mark the stay as cancelled altogether, set the status instead.',
          responses: { 200: accommodationOk('Cleared'), 401: { $ref: '#/components/responses/Unauthorized' }, 404: { $ref: '#/components/responses/NotFound' } },
        },
      },
      '/journeys/{id}/stops/{stopId}/accommodation/status': {
        parameters: [idParam, stopIdParam],
        put: {
          ...auth, tags: ['Accommodation'], operationId: 'setAccommodationStatus', summary: 'Set the status by hand',
          description: 'Any status, including backwards. Use it for the steps nothing else implies: searching when you start, deciding when you have shown the user the options, checked_in, completed, cancelled.',
          requestBody: { required: true, content: json({ type: 'object', required: ['status'], properties: { status: { $ref: '#/components/schemas/AccommodationStatus' } } }, { status: 'searching' }) },
          responses: { 200: accommodationOk('Updated'), ...accommodationErrors },
        },
      },
      '/journeys/{id}/stops/{stopId}/accommodation/notes': {
        parameters: [idParam, stopIdParam],
        get: {
          ...auth, tags: ['Accommodation'], operationId: 'getAccommodationNotes', summary: 'Every note on the plan in one place',
          responses: {
            200: {
              description: 'OK',
              content: json({
                type: 'object',
                required: ['notes', 'requirements_notes', 'options', 'booking_notes'],
                properties: {
                  notes: { type: ['string', 'null'] },
                  requirements_notes: { type: ['string', 'null'] },
                  options: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, risks: { type: ['string', 'null'] }, notes: { type: ['string', 'null'] } } } },
                  booking_notes: { type: ['string', 'null'] },
                },
              }, { notes: 'ask about late check-in', requirements_notes: null, options: [{ id: '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f', name: 'Loft in Tay Ho', risks: 'no reviews from the last 6 months', notes: 'host replies within an hour' }], booking_notes: null }),
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
        put: {
          ...auth, tags: ['Accommodation'], operationId: 'setAccommodationNotes', summary: 'Replace the plan\'s notes',
          requestBody: { required: true, content: json({ type: 'object', required: ['notes'], properties: { notes: { type: ['string', 'null'], maxLength: 2000 } } }, { notes: 'ask about late check-in' }) },
          responses: { 200: accommodationOk('Updated'), ...accommodationErrors },
        },
      },
      '/openapi.json': {
        get: { tags: ['Meta'], operationId: 'getSpec', summary: 'This document', security: [], responses: { 200: { description: 'OpenAPI 3.1' } } },
      },
      '/docs': {
        get: { tags: ['Meta'], operationId: 'getDocs', summary: 'This document, rendered for people', security: [], responses: { 200: { description: 'HTML' } } },
      },
    },
  };
}

/** A one-file reader for the spec, for the people side of the audience. */
export function docsHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nomadu agent API</title>
<style>body{margin:0}</style>
</head>
<body>
<redoc spec-url="${API_BASE}/openapi.json" hide-download-button></redoc>
<script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body>
</html>`;
}
