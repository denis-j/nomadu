# Nomadu backend

Nomadu is offline-first: every trip, plan and document lives in SQLite on the phone, and the app works with no connection at all. The backend is the part that needs a server for one of three reasons: a secret that must not ship in the app (the Gemini key), something that must survive the phone (cloud sync, account deletion), or a caller that is not the app (an AI agent).

It is one Firebase project, `nomady-dcff6`, region `us-central1`:

| Piece | What it does |
| --- | --- |
| **Firebase Auth** | Sign-in with email, Apple and Google. Every other piece keys off the uid. |
| **Firestore** | Mirror of the phone's data, one subtree per user. Also the AI budget counters and the agent token hashes. |
| **Cloud Functions** (`functions/src`) | Eight functions: three Gemini proxies, account deletion, three token callables, and the agent HTTP API. |
| **Secret Manager** | `GEMINI_API_KEY`. The only secret; read inside the functions, never by the app. |

Third parties the app talks to directly, not through this backend: RevenueCat (subscriptions), Sentry (crashes), Apple Maps and Core Location (on-device), EAS (builds).

## Firestore

Every user owns exactly one subtree. The rules (`firestore.rules`) let a signed-in user read and write `users/{uid}` and its subcollections and nothing else; the two top-level collections below are Admin-SDK only and closed to clients.

```
users/{uid}                         profile
  trips/{syncId}                    tracked stays (the timeline)
  visas/{syncId}                    visas the user typed in
  journeys/{syncId}                 plans, stops and travellers embedded
ai_usage/{uid}_{YYYY-MM-DD}         per-day AI call counters       (functions only)
agent_tokens/{sha256}               hashed agent tokens            (functions only)
```

**`users/{uid}`** is created on first sign-in (`email`, `displayName`, `photoURL`, `createdAt`) and merged with `citizenship {country, countryCode}` and `hasFixedResidence` whenever onboarding or a sync runs. The visa and tax arithmetic needs those two, on the phone and on the server.

**`trips`**: `city, country, country_code, latitude, longitude, start_date, end_date (null while ongoing), days, local_id, updated_at, deleted`. A stay the agent added also carries `created_by: 'agent'`.

**`visas`**: `country_code, label, valid_from, valid_to, max_days_per_stay, max_days_per_window, window_days, entries_allowed, notes, local_id, updated_at, deleted`.

**`journeys`**: `title, legs[], travellers[], local_id, updated_at, deleted`. Each leg is `{sync_id, city, country, country_code, latitude, longitude, start_date, end_date, transport, notes, sort_order}`, each traveller `{sync_id, name, sort_order}`. Legs chain: every stop starts the day after the previous one ends. Documents (tickets, bookings) are deliberately not here; they stay on the phone.

### Sync rules

The phone is the source of truth for its own edits, the cloud is the meeting point between devices.

- **Ids**: every row gets a UUID `sync_id` the first time it is pushed; that UUID is the Firestore document id. Local integer ids never leave the phone.
- **Last write wins** by `updated_at`, compared as instants. A push skips rows whose cloud copy is at least as new; a pull skips documents older than the local row.
- **Deletes are tombstones** (`deleted: true`), so a device that was offline learns about them.
- **Realtime**: while cloud sync is on, the app listens to `trips` and `journeys` with `onSnapshot`, so an agent's plan appears on the phone within seconds; a full push/pull (`syncAll`) runs on every app start and on demand.
- Cloud sync is opt-in per account (`@cloud_sync_enabled_{uid}` on the phone). With it off, nothing is written to Firestore and the agent API sees nothing.

## Cloud Functions

Seven of the eight functions are Firebase **callables**, one (`agentApi`) is a plain HTTP function. The difference matters for the documentation: the OpenAPI spec below covers `agentApi` only. Callables are not HTTP routes in the ordinary sense; they are invoked through the Firebase SDK, which wraps the request, attaches the signed-in user's ID token and unwraps the `{data}` envelope. Documenting them as REST would describe an interface nobody uses, so they are documented here instead.

All callables require a signed-in Firebase user and are called from the app like this:

```ts
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

const fn = httpsCallable<{ city: string; country: string }, { tips: string }>(functions, 'cityTips');
const { data } = await fn({ city: 'Lisbon', country: 'Portugal' });
```

`lib/ai.ts` wraps the three AI ones with error mapping, `lib/auth.ts` calls `deleteAccount`, and `app/(tabs)/(settings)/agent-connect.tsx` and `agent.tsx` call the token ones. Errors use the standard `HttpsError` codes (`unauthenticated`, `invalid-argument`, `resource-exhausted`, `not-found`, `internal`).

### AI (Gemini proxies)

Model `gemini-3.1-flash-lite`, key from Secret Manager. Prompts are built server-side from structured input (`prompts.ts`); the client never sends free text to the model, so the functions cannot be used as a general Gemini gateway. Every call is counted in `ai_usage` per user and day (`rateLimit.ts`), in a transaction so parallel calls cannot slip past the limit.

| Function | Input | Output | Daily limit |
| --- | --- | --- | --- |
| `suggestStops` | `journeyTitle`, `legs[{city, country, startDate, endDate}]` (max 40), optional `visaTaxContext`, `userPreference` | `{suggestions: [{city, country, reason, startDate, endDate, transport}]}` (3) | 40 |
| `cityTips` | `city`, `country` | `{tips: string}` | 60 |
| `extractTrips` | `imageBase64` (max 7 MB), `mimeType` (jpeg, png, webp, heic) | `{trips: [{city, country, startDate, endDate or null}]}`, empty when nothing is readable | 30 |

Used by the Plan screen (suggestions under a trip, tips on a stop) and the screenshot import.

### Account

| Function | What it does |
| --- | --- |
| `deleteAccount` | Recursively deletes `users/{uid}`, then the user's `ai_usage` and `agent_tokens` documents, then the Auth record, in that order so a partial failure is always retryable. Run server-side because the client SDK demands a recent login for this. |

### Agent access

An AI agent (Hermes, Claude, anything that can call HTTPS) gets a personal token and talks to `agentApi` on the user's behalf. Tokens are created in the app under Settings, AI agent.

| Callable | Input | Output |
| --- | --- | --- |
| `createAgentToken` | `label`, `editTimeline` (bool) | `{id, token, label, edit_timeline}`; the token is returned exactly once. Max 5 per user. |
| `listAgentTokens` | | `{tokens: [{id, label, prefix, edit_timeline, created_at, last_used_at}]}` |
| `revokeAgentToken` | `id` | `{ok}` |

Only `sha256(token)` is stored, as the document id in `agent_tokens`, with `uid, label, prefix, edit_timeline, created_at, last_used_at`. Revoking is deleting the document. `edit_timeline` is fixed at creation: a read-only token cannot write to `trips`, whatever the agent asks.

#### `agentApi` (HTTP)

Base URL `https://us-central1-nomady-dcff6.cloudfunctions.net/agentApi/v1`, header `Authorization: Bearer nmd_…`, JSON in and out, dates as `YYYY-MM-DD`. Errors are `{error: {code, message}}` with 400, 401, 403, 404, 409 or 500.

The full contract lives in `src/openapi.ts` (OpenAPI 3.1, every request and response schema, examples, the rules an agent should follow) and is served three ways:

- **`/v1/openapi.json`**: the spec, public. What an agent reads first.
- **`/v1/docs`**: the same spec rendered with Redoc, for people: https://us-central1-nomady-dcff6.cloudfunctions.net/agentApi/v1/docs
- **`docs/openapi.json`** in the repo, rewritten on every `npm run build` (or `npm run openapi`), so changes show up in diffs. `npx @redocly/cli lint docs/openapi.json` checks it.

`lib/agentSetup.ts` in the app generates the short briefing that goes into the agent's prompt; it points at the spec for the details.

| Method and path | What it does | Needs |
| --- | --- | --- |
| `GET /me` | citizenship, fixed residence, counts, first tracked day | |
| `GET /trips?from&to` | tracked stays with `id`, place, dates and days; both filters optional | |
| `GET /trips/{id}` | one stay | |
| `POST /trips` | add a past stay: `city, country` or `country_code, start_date, end_date`. Both dates required, start not in the future. Coordinates come from the bundled city dataset. | edit_timeline |
| `PATCH /trips/{id}` | correct a stay; send only the fields that change | edit_timeline |
| `DELETE /trips/{id}` | tombstone a stay | edit_timeline |
| `GET /stats?year` | days away, countries, cities, stops; all time without `year` | |
| `GET /visa` | visa standing per destination (days allowed, used, left, status) | |
| `GET /tax` | tax residency exposure per country, current year | |
| `GET /journeys` | all plans with stops | |
| `POST /journeys` | create a plan: `title, stops[{city, country, start_date?, end_date? or days, transport?, notes?}]`; stops chain from the first start date | |
| `GET /journeys/{id}` | one plan | |
| `PATCH /journeys/{id}` | rename or replace the stops, keeping ids of stops that stay | |
| `DELETE /journeys/{id}` | tombstone a plan | |

The visa, tax and stats numbers are computed by the app's own code (`lib/visaCalculations`, `lib/taxCalculations`, `lib/stats`), bundled into the function with esbuild (`build.mjs`, Expo modules stubbed), so the agent gets the same numbers the Tracking screen shows. Country names are resolved against the bundled dataset; an unknown country is a 400, not a guess.

## Working on it

```
cd functions
npm run typecheck        # tsc, no emit
npm run build            # esbuild -> lib/index.js, then docs/openapi.json (also the deploy predeploy)
npm run openapi          # only rewrite docs/openapi.json
npm run deploy           # all functions
npx firebase deploy --only functions:agentApi --project nomady-dcff6
npx firebase deploy --only firestore:rules --project nomady-dcff6
npm run logs
```

`GEMINI_API_KEY` is set once with `npx firebase functions:secrets:set GEMINI_API_KEY`. The app's own configuration (`EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_GOOGLE_*`, `EXPO_PUBLIC_SENTRY_DSN`) is public by design and inlined at build time; `scripts/check-env.mjs` refuses a build without it.

Housekeeping still to do by hand: a Firestore TTL policy on `ai_usage.expiresAt` so old counters delete themselves.
