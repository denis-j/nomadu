# AGENTS.md — Nomadu

Context for AI coding agents working in this repo. Read this first.

## What this is

**Nomadu** (slug `nomady`) is a cross-platform mobile app for travellers / digital
nomads: trip timelines, maps, visa & tax day-tracking, journey planning, documents,
and social sharing. Built with Expo + React Native, backed by Firebase.

- iOS bundle / Android package: `com.nomady.app`
- URL scheme: `nomady`
- App name: Nomadu

## Tech stack

- **Framework:** Expo (SDK via `expo`), React Native, React 19
- **Routing:** `expo-router` (file-based, see `app/`)
- **Language:** TypeScript, `strict: true` (extends `expo/tsconfig.base`)
- **Backend:** Firebase (Auth, Firestore, Storage, Cloud Functions) + App Check
- **State/data:** local SQLite (`expo-sqlite`) + Firestore sync layer (`lib/sync.ts`)
- **Payments:** RevenueCat (`react-native-purchases`)
- **Analytics/monitoring:** PostHog, Sentry
- **3D/graphics:** `react-native-filament`, GLB models (optimized via `scripts/`)
- **Maps:** Apple Maps on iOS (no key), Google Maps on Android (needs key)
- **Lint:** ESLint flat config (`eslint-config-expo`)

## Project layout

```
app/              expo-router routes. Tab groups: (timeline) (stats) (map) (plans)
                  Dynamic routes: city/[key], join/[code]
components/       Reusable UI components (PascalCase .tsx)
lib/              Business logic & services (camelCase .ts) — auth, sync, firebase,
                  visaCalculations, taxCalculations, database, etc.
hooks/            React hooks (useXxx.ts)
contexts/         React context providers (OnboardingContext, SyncContext)
constants/        Static config/values
functions/        Firebase Cloud Functions (separate package, own tsconfig)
assets/           Images, fonts, GLB models
scripts/          Build/data scripts (visa data, cities, GLB optimize, env check)
modules/          Native/expo modules
patches/          patch-package patches (applied on postinstall)
docs/             Project docs
android/ ios/     Native projects (prebuild output)
web/ dist/        Web build artifacts
```

## Commands

App (run from repo root):
- `npm start` — Expo dev server
- `npm run ios` / `npm run android` — native run
- `npm run web` — web dev server
- `npm run lint` — ESLint (`expo lint`)
- `npm run check-env` — validate required env vars
- `npx tsc --noEmit` — typecheck the app

Cloud Functions (run from `functions/` or via root aliases):
- `npm run fn:build` — build functions (+ dump OpenAPI)
- `npm run fn:deploy` — `firebase deploy --only functions`
- `npm run fn:logs` — tail function logs
- `npm run rules:deploy` — deploy Firestore rules
- In `functions/`: `npm run typecheck`, `npm run test`, `npm run test:rules`, `npm run serve` (emulators)

Data generation:
- `npm run visa-data:refresh`, `npm run cities:refresh`, `npm run glb:optimize`

## Conventions

- **TypeScript strict.** No `any` unless truly unavoidable; prefer precise types.
- **File naming:** components `PascalCase.tsx`; lib/hooks/utilities `camelCase.ts`;
  hooks start with `use`.
- **Imports:** path alias `@firebase/auth` is remapped (see `tsconfig.json`) — keep it.
- **Firebase access** goes through `lib/firebase.ts` and the service modules in `lib/`,
  not ad-hoc in components.
- **Data flow:** UI → hooks → `lib/` services → SQLite/Firestore. Sync is centralized
  in `lib/sync.ts` / `SyncContext`. Don't bypass it.
- **Platform differences:** guard native-only APIs; maps differ per platform (see below).
- Keep `console` logs sparse — a babel plugin strips them in production builds.

## UI rules

These hold for every screen. Reuse the component named here; do not build a
variant, and do not restyle one locally.

- **Sheets are solid.** Anything presented as a sheet (`formSheet`, `sheetWithHeader`)
  sets `contentStyle: { backgroundColor: sheetBackground }`, and so does the inner
  stack of a sheet that has one. Never transparent. Heights may differ with the content.
- **A sheet saves or moves on top right**, always with `HeaderAction` (`components/HeaderAction.tsx`)
  in `headerRight`: a checkmark saves, `next` shows the arrow. No button for this at the bottom
  of a sheet, and no hand-built checkmark. `CloudyButton` stays for pages, empty states,
  sign-in and onboarding.
- **Text input is `FormField` inside `FormCard`** (`components/FormField.tsx`), the look
  of the sign-in screen. The placeholder names the field; there is no label beside or
  above it. `leading` is only the magnifier of a search, `trailing` holds one small
  control (show password, clear, send, a currency). Do not use `TextInput` directly.
  The one exception is the morphing search chip in `(settings)/passport.tsx`.
- **Section headings come in two kinds.** The quiet one is the default: small, grey and
  uppercase, as in Settings and in every sheet: always `Typography.sectionLabel`, through
  `SectionHead` or `SectionLabel` where they fit, never its own values. The bold one is for a heading that opens a big block of
  its own on a main page, like "Reiseführer" in the Plan tab. Do not make quiet headings bold.
  `npm run lint` fails on an uppercase style written outside `constants/typography.ts`.
- **Nothing here yet is `EmptyState`** (`components/EmptyState.tsx`), modelled on Verlauf
  and Tracking: the moving picture, a bold title, a grey line. The way in is a cloud
  button (`primary`), with an outlined `secondary` if there is a second one; leave them
  out when there is nothing to do, or for a guest on a shared trip. Pick three `icons`
  that fit the screen. No emoji, no static icon, no "tap +" in the text. It always sits
  centred in the visible area between the header and the tab bar, and the page does not
  scroll: render it directly, never in a `ScrollView` with `flexGrow` and automatic insets.
  On a tab root with a large title pass `belowLargeTitle`.
  A control needed to get out of it (filter pills, a year picker) stays above it. A map, an
  input or a note that only serves the content is hidden until there is content. The only
  exception is `inline`, when real content follows it on the page. Dashed
  `SlotCard`s for suggested items and one-line "no results" in a search are not empty states.

## Secrets & env

- Secrets live in `.env.local` (git-ignored); EAS reads the same names from its env.
- `app.config.js` injects only what must stay out of git (e.g. `GOOGLE_MAPS_ANDROID_API_KEY`).
  Everything else is in `app.json`.
- **Never commit** API keys, `.env.local`, `GoogleService-Info.plist`, or signing material.
- Run `npm run check-env` if something env-related breaks.

## Guardrails for agents

- Don't edit generated/native output casually: `ios/`, `android/`, `dist/`, `web/`,
  `functions/lib/`, `node_modules/`. Change source + rebuild instead.
- `functions/` is its own npm package with its own `tsconfig` — build/typecheck it there.
- After dependency changes, remember `patch-package` runs on `postinstall`.
- Run `npm run lint` and `npx tsc --noEmit` before considering a change done.
- Firestore security changes must be reflected in `firestore.rules` and tested via
  `functions/` `test:rules`.
- Prefer small, targeted edits; match the existing style of nearby files.
