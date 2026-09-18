/**
 * The agent API, described.
 *
 * Served live at /v1/openapi.json, rendered at /v1/docs, and dumped to
 * docs/openapi.json by `npm run openapi` so the spec can be read in the repo
 * and diffed in reviews. One object, no framework: the routes in agent.ts are
 * few enough that keeping this by hand is cheaper than generating it, and
 * the descriptions are written for a model that reads them once.
 */

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
  description: 'Days present in a country this calendar year against its tax residency threshold.',
  required: ['country', 'countryCode', 'ruleLabel', 'thresholdDays', 'daysPresent', 'daysRemaining', 'percentUsed', 'year', 'status'],
  properties: {
    country: { type: 'string', example: 'Thailand' },
    countryCode: countryCode,
    flag: { type: 'string' },
    ruleLabel: { type: 'string', example: '180 days in a calendar year' },
    thresholdDays: { type: 'integer', example: 180 },
    daysPresent: { type: 'integer' },
    daysRemaining: { type: 'integer' },
    percentUsed: { type: 'number' },
    year: { type: 'integer', example: 2026 },
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
      version: '1.1.0',
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
          description: 'Days present this calendar year against each country\'s residency threshold. `resident` means the threshold is reached.',
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
          description: 'Send `title`, `stops`, or both. `stops` replaces the whole list; a stop with the same city and country as before keeps its id. Ask the user before replacing stops they arranged by hand.',
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
          description: 'Ask the user first.',
          responses: {
            200: { description: 'Deleted', content: json({ type: 'object', properties: { ok: { type: 'boolean' } } }, { ok: true }) },
            401: { $ref: '#/components/responses/Unauthorized' },
            404: { $ref: '#/components/responses/NotFound' },
          },
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
