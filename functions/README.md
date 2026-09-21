# Nomadu backend

Nomadu is offline-first: every trip, plan and document lives in SQLite on the phone, and the app works with no connection at all. The backend is the part that needs a server for one of three reasons: a secret that must not ship in the app (the Gemini key), something that must survive the phone (cloud sync, account deletion), or a caller that is not the app (an AI agent).

It is one Firebase project, `nomady-dcff6`, region `us-central1`:

| Piece | What it does |
| --- | --- |
| **Firebase Auth** | Sign-in with email, Apple and Google. Every other piece keys off the uid. |
| **Firestore** | Mirror of the phone's data, one subtree per user. Also the AI budget counters and the agent token hashes. |
| **Cloud Functions** (`functions/src`) | Fifteen functions: three Gemini proxies, account deletion, three token callables, the agent HTTP API (timeline, plans, accommodation), six sharing callables and the invite page. |
| **Secret Manager** | `GEMINI_API_KEY`. The only secret; read inside the functions, never by the app. |

Third parties the app talks to directly, not through this backend: RevenueCat (subscriptions), Sentry (crashes), Apple Maps and Core Location (on-device), EAS (builds).

## Firestore

Every user owns exactly one subtree. The rules (`firestore.rules`) let a signed-in user read and write `users/{uid}` and its subcollections and nothing else; the two top-level collections below are Admin-SDK only and closed to clients.

```
users/{uid}                         profile
  trips/{syncId}                    tracked stays (the timeline)
  visas/{syncId}                    visas the user typed in
  journeys/{syncId}                 plans, stops and travellers embedded
  accommodations/{stopSyncId}       where to stay at one stop, options embedded
shared_journeys/{journeySyncId}     a trip shared with friends: mirror plus members
  documents/{docSyncId}             records of the documents shared on it
invites/{code}                      invite code -> journey         (functions only)
ai_usage/{uid}_{YYYY-MM-DD}         per-day AI call counters       (functions only)
agent_tokens/{sha256}               hashed agent tokens            (functions only)
```

**`users/{uid}`** is created on first sign-in (`email`, `displayName`, `photoURL`, `createdAt`) and merged with `citizenship {country, countryCode}` and `hasFixedResidence` whenever onboarding or a sync runs. The visa and tax arithmetic needs those two, on the phone and on the server.

**`trips`**: `city, country, country_code, latitude, longitude, start_date, end_date (null while ongoing), days, local_id, updated_at, deleted`. A stay the agent added also carries `created_by: 'agent'`.

**`visas`**: `country_code, label, valid_from, valid_to, max_days_per_stay, max_days_per_window, window_days, entries_allowed, notes, local_id, updated_at, deleted`.

**`journeys`**: `title, legs[], travellers[], local_id, updated_at, deleted`. Each leg is `{sync_id, city, country, country_code, latitude, longitude, start_date, end_date, transport, notes, sort_order}`, each traveller `{sync_id, name, sort_order}`. Legs chain: every stop starts the day after the previous one ends. Documents (tickets, bookings) are deliberately not here; they stay on the phone.

**`accommodations`**: one document per journey stop, and the document id *is* the stop's `sync_id`, so a stop has at most one plan. `journey_id, stop_id, needed, status, check_in, check_out, requirements{type, budget_per_night, budget_total, currency, areas[], min_requirements, work_requirements, amenities[], dates_flexible, notes}, options[], selected_option_id, booking{…} | null, notes, local_id, updated_at, deleted, created_by`. Each option is `{sync_id (as id), name, platform, url, address, check_in, check_out, total_price, price_per_night, currency, fees, rating, rating_scale, review_count, cancellation_policy, amenities[], score, risks, notes, last_checked_at, sort_order}`; the booking holds `option_id, booking_url, booking_reference, price, currency, address, check_in_info, check_out_info, deposit, deposit_currency, provider_contact, notes, review_rating, review_text`. Never a card number, password or login: there is no field for them and the text fields refuse card numbers.

**`shared_journeys`**: one document per trip its owner invited friends to, keyed by the journey's sync id: `owner_uid, owner_name, invite_code, member_uids[], members{uid: {name, joined_at}}` plus the mirror `title, legs[], travellers[], updated_at, deleted`. The owner's phone rewrites the mirror fields on every push (`setDoc` with merge, see `pushJourneysToCloud`); the rules let the owner change only those fields, and let members read. `member_uids` and `members` change only through the sharing callables. A member's phone follows the document live and keeps the trip in its own `journeys` table with `shared_owner_uid` set, which makes it read-only there. The owner's accommodation plans ride along in `accommodations{stopId: plan}`, written by the owner's phone after every plan push; documents are not mirrored.

**`shared_journeys/{id}/documents`**: the documents people share on a trip, `title, kind, mime, file_name, traveller_uid (null for everyone), uploader_uid, path, updated_at`; the file itself is in Storage at `shared/{journeyId}/{docSyncId}.{ext}`. Only what someone else may see leaves a phone: documents for everyone, and documents for a friend with an account. The owner's own and those of names typed into the wallet stay local. Rules on both services say the same thing: the owner reads all, a member reads what is for everyone or for them, both may add (a member only for everyone or themselves), the uploader or the owner deletes. `lib/documentSync.ts` in the app does the pushing, pulling and listening; `storage.rules` is deployed next to `firestore.rules`.

**`invites`**: `journey_id, owner_uid, created_at` under the eight-character code. Closed to clients: a client that could list codes could join any trip.

Why a separate collection and not a field on the leg: a journey document is replaced whole on every push and on every `PATCH /journeys` with stops, so anything embedded in `legs[]` would be lost the moment either side rewrote the list. Keyed by the stop's id, the plan survives renames, reorders and re-chaining and only goes when the stop goes (the phone tombstones it then). The plan keeps its own `check_in`/`check_out`: a stop that moves does not silently move a booking, the API reports `dates_match_stop: false` instead. A plan is planning only; nothing derives a `trips` row, a visa count or a tax number from it. The rules (what is a valid price, when a status advances) live in `lib/accommodationModel.ts`, shared by the app and the function.

### Sync rules

The phone is the source of truth for its own edits, the cloud is the meeting point between devices.

- **Ids**: every row gets a UUID `sync_id` the first time it is pushed; that UUID is the Firestore document id. Local integer ids never leave the phone.
- **Last write wins** by `updated_at`, compared as instants. A push skips rows whose cloud copy is at least as new; a pull skips documents older than the local row.
- **Deletes are tombstones** (`deleted: true`), so a device that was offline learns about them.
- **Realtime**: while cloud sync is on, the app listens to `trips`, `journeys`, `accommodations` and both sides of `shared_journeys` with `onSnapshot`, so an agent's plan, the hotel options it found, or a friend's change to a shared trip appear on the phone within seconds; a full push/pull (`syncAll`) runs on every app start and on demand, and plans are pushed two seconds after a local edit (`lib/syncTrigger.ts`).
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

Only `sha256(token)` is stored, as the document id in `agent_tokens`, with `uid, label, prefix, edit_timeline, created_at, last_used_at`. Revoking is deleting the document. `edit_timeline` is fixed at creation: a read-only token cannot write to `trips`, whatever the agent asks. Everything that is planning (journeys, accommodation) is writable with any token; the flag guards the tracked past and only that.

### Sharing a trip

One person plans, the others come along. The owner makes an invite link, a friend opens it, and the trip is on the friend's phone from then on: live, read-only, with the visa and tax chips computed for the friend's own passport, and their own tab in the documents wallet. All in `src/share.ts`.

| Callable | Input | Output |
| --- | --- | --- |
| `shareJourney` | `journeyId` (sync id), optional `name` | `{code, url}`; creates `shared_journeys/{id}` and `invites/{code}`, or returns the existing code |
| `previewInvite` | `code` | title, owner name, dates, stops, member count, `is_owner`, `is_member` |
| `joinJourney` | `code`, `name` | adds the caller to `member_uids` and `members` (max 20) |
| `leaveJourney` | `journeyId` | removes the caller; for the owner this is `unshareJourney` |
| `removeJourneyMember` | `journeyId`, `memberUid` | owner only: removes a friend; the link stays valid, they can come back |
| `unshareJourney` | `journeyId` | deletes the mirror and the invite; members' phones tombstone their copy |

`sharePage` (HTTP) at `https://us-central1-nomady-dcff6.cloudfunctions.net/sharePage/{code}` renders the trip for someone without the app: the stops, an "Open in Nomadu" button (`nomady://join/{code}`) and a link to the store. It shows only what the owner chose to share by making the link.

Account deletion (`deleteAccount`) unshares every trip the user owns and removes them from every trip they joined.

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
| `PATCH /journeys/{id}` | rename or replace the stops, keeping ids (and accommodation plans) of stops that stay; dropped stops take their plan with them | |
| `DELETE /journeys/{id}` | tombstone a plan and the accommodation plans of its stops | |
| `GET /accommodations?journey_id&status` | every accommodation plan with its stop and journey title; plans whose stop is gone are left out | |
| `GET /journeys/{id}/stops/{stopId}/accommodation` | one stop's plan; 404 until one exists | |
| `PUT` or `PATCH` `…/accommodation` | create (201) or update (200) the plan: `needed, status, check_in, check_out, requirements{…}, notes`; absent fields keep their value | |
| `DELETE …/accommodation` | tombstone the plan | |
| `POST …/accommodation/options` | save a found place (creates the plan when missing, max 30 per stop); status advances to `options_available` | |
| `PATCH` or `DELETE` `…/accommodation/options/{optionId}` | correct or remove one | |
| `POST …/accommodation/options/{optionId}/select` | mark the pick; status advances to `selected` | |
| `PUT` or `PATCH` `…/accommodation/booking` | save booking details; links to the selected option, status advances to `booked` | |
| `DELETE …/accommodation/booking` | forget the booking, status falls back | |
| `PUT …/accommodation/status` | set any status by hand | |
| `GET` or `PUT` `…/accommodation/notes` | every note on the plan in one place, or replace the plan's notes | |

Every stop in a journey response also carries `accommodation: {status, needed, check_in, check_out, nights, options, selected, booked} | null`. Every write returns the whole plan, with `nights` and `dates_match_stop` computed. Validation is the model's: real calendar days with at least one night, prices as numbers with an ISO 4217 currency beside them, ratings against their scale (5 or 10), http(s) URLs only, and a 400 for a card number in any text field.

The visa, tax and stats numbers are computed by the app's own code (`lib/visaCalculations`, `lib/taxCalculations`, `lib/stats`), bundled into the function with esbuild (`build.mjs`, Expo modules stubbed), so the agent gets the same numbers the Tracking screen shows. Country names are resolved against the bundled dataset; an unknown country is a 400, not a guess.

## Working on it

```
cd functions
npm run typecheck        # tsc, no emit (src and test)
npm test                 # node --test against an in-memory Firestore, see below
npm run build            # esbuild -> lib/index.js, then docs/openapi.json (also the deploy predeploy)
npm run openapi          # only rewrite docs/openapi.json
npm run deploy           # all functions
npx firebase deploy --only functions:agentApi --project nomady-dcff6
npx firebase deploy --only firestore:rules,storage --project nomady-dcff6
npm run logs
```

### Tests

`test/` holds three suites, run by `scripts/test.mjs` with Node's own runner, no framework. `model.test.ts` covers the shared accommodation rules (dates, money, status arithmetic, the transitions) as pure functions. `api.test.ts` drives the whole agent API through `serve()` with a fake request and response: authentication, the read-only token's limits, every accommodation route, and the promise that accommodation writes never touch the journey, the timeline or the profile. `share.test.ts` covers the sharing calls (share, preview, join, leave, unshare, account deletion) and the invite page. The Firestore Admin SDK is swapped for `test/fakeFirestore.ts` at bundle time, an in-memory map with the handful of methods the routes use; there is no emulator and no Java to install. Adding a route means adding a test there.

`GEMINI_API_KEY` is set once with `npx firebase functions:secrets:set GEMINI_API_KEY`. The app's own configuration (`EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_GOOGLE_*`, `EXPO_PUBLIC_SENTRY_DSN`) is public by design and inlined at build time; `scripts/check-env.mjs` refuses a build without it.

Housekeeping still to do by hand: a Firestore TTL policy on `ai_usage.expiresAt` so old counters delete themselves.
