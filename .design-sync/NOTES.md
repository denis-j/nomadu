# design-sync notes (Nomadu)

Target project: https://claude.ai/design/p/a9799aac-43aa-4471-873f-fc24019020e0 ("Nomadu"). The older hand-made "Nomadu Design System" project is separate and was deliberately left untouched.

## How this repo syncs

- Nomad is an Expo / React Native app with no web build and no Storybook. `.design-sync/web-build.mjs` (cfg.buildCmd) compiles a curated set of components (`.design-sync/web-entry.ts`) for the browser and writes a fake package to `.design-sync/.cache/web-pkg/` (ESM bundle, tsc declarations, `tokens.css`). The converter then runs against it via `cfg.entry`.
- Run order: `node .design-sync/web-build.mjs`, then the driver (`resync.mjs`, `--node-modules ./node_modules`). Always rebuild web-pkg first: it is gitignored and goes stale silently.
- `.ds-sync/` needs `esbuild ts-morph @types/react react-native-web@0.21 playwright@1.61.1` (1.61.1 matches the cached chromium-1228 in ~/Library/Caches/ms-playwright).
- `react-native` is aliased to `.design-sync/rn-web-shim.js`: react-native-web plus no-op `PlatformColor`, `ActionSheetIOS` and similar iOS-only APIs.
- Native-only modules (expo-sqlite, expo-haptics, expo-router, expo-location, @react-native-menu/menu, ...) are stubbed by the `native-stubs` plugin. Each stub exports exactly the members the app sources use (scanned from components/, lib/, utils/, constants/, hooks/, contexts/), because esbuild drops Proxy members from `import * as X`.
- Banner shims in the ESM bundle: `require()` routed to the react externals (CommonJS deps call require('react')), a `process` fallback (Reanimated reads process.env.JEST_WORKER_ID), and `<style id="react-native-stylesheet">` pre-created at the end of `<body>`. Without that last one the render check reads react-native-web's empty head style tag as the mount root and reports every card "root empty".
- `SafeAreaProvider` is exported and set as `cfg.provider` (UpdateBanner uses safe-area insets).
- `dtsPropsFor` hand-writes props for components whose types point at app-internal types (Trip, DestinationGuide, YearFilter, PillOption, BubbleIcon) and for Ionicons and Flag.
- Tokens come from `constants/colors.ts` and `constants/typography.ts`, evaluated at build time into `--color-*` and `--type-*` CSS variables. The app uses the system font (SF Pro on iOS), so no fonts ship; `--font-sans` is a system stack.

## Scope decisions

- Synced (18): CloudyButton, CountryPicker, EmptyState, Flag, GlassPill, GuideCard, Ionicons, PillRow, StatCard, StatRow, StatTile, StatsBars, StopSummary, TimelineBubbles, TransportPicker, TripCard, UpdateBanner, YearPicker.
- Excluded on purpose: 3D models (LogoModel3D, PlaneModel3D, CountryBadge3D), MapView, IslandSheet (gesture handler + blur), Dropdown (native menu), TravellerAvatars, ProfileEditor and MarkdownTips (app data and services), splash and onboarding animations.
- OnboardingProgress was dropped: its Reanimated `withTiming` fill never advances in this web build, because there is no worklets babel plugin, so the bar stays at 0. Adding the babel plugin to web-build.mjs would bring it back.

## Known render warns

- None at the final build. Nine components use `cardMode: column` because their phone-width stories overflow a grid cell.

## Re-sync risks

- Reanimated-driven motion in StatsBars, TimelineBubbles and UpdateBanner renders in its initial or final static state; entrance animations don't play on web.
- `CloudBackdrop` (CloudyButton's texture) is react-native-svg on web. It was graded plausible from screenshots only, never compared side by side against the iOS app.
- `expo-glass-effect` reports glass unavailable on web, so GlassPill, StatCard, StatTile and PillRow render their non-glass fallback styles. That is the Android look, not iOS Liquid Glass.
- The `systemColor()` palette resolves to the Android fallback colors on web.
- GuideCard's preview imports `GUIDES` from constants/guides.ts and loads Unsplash photos over the network.
- New components need an entry in web-entry.ts and a preview in `.design-sync/previews/`. A new native-only import needs adding to `STUBS` in web-build.mjs.
