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
