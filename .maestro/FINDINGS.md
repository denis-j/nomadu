# Maestro E2E findings

Status: tests built, partial run. Notes from running against the iOS 26.5 simulator in a **debug build** with Metro attached.

## How to run

```bash
export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH:$HOME/.maestro/bin"
maestro test .maestro/01-fresh-install.yaml
maestro test .maestro/02-onboarding-funnel.yaml
maestro test .maestro/03-sign-up.yaml
maestro test .maestro/04-returning-user.yaml
```

## Bugs found in the app

### 1. iOS notification permission dialog pops up during citizenship (high)

On a fresh install the system "Nomadu möchte dir Mitteilungen senden" dialog appears while the user is still on citizenship. The only place that calls `requestNotificationPermissions()` automatically is `app/(tabs)/_layout.tsx`, which should not be mounted yet. Worth tracing: either the tab group is briefly mounted on launch (router race during `onboardingDone` resolution) or a previous-session deferred dialog is being delivered now. Either way the user shouldn't see it before the permissions screen.

### 2. Sign-up hang reported by user (critical, not yet automated)

Reported manually. The Maestro flow `03-sign-up.yaml` doesn't reach the assertion yet because of issues #4 and #5, but this needs a focused trace. Suspected paths:
- `OnboardingContext` migration effect runs after `onAuthStateChanged` fires, but `onboardingDone` carries the previous truthy value, so the router routes to `/paywall` and the migration races with the auto navigation.
- RevenueCat `identifyUser(uid)` may be in-flight when paywall mounts, leaving `subLoading` true.
Recommended next step: console.log timestamps around (a) `signUpWithEmail` resolution, (b) `OnboardingContext` effect, (c) `RootNavigator` decision branches.

### 3. "Prefetch failed: Error: Calling the 'execAsync...'" red banner

Shown by the dev redbox before SQLite is ready. Comes from `lib/prefetch.ts` → `getAllTrips()`. Fix: guard `prefetchAll` against the "DB not initialized yet" case, or call it after the first authenticated user is available.

### 4. "Background location error" red banner

Appears on the citizenship screen when location permission has not been granted. Caused by background-task registration trying to run before the permissions step.

### 5. Dev warning banner covers the bottom of citizenship

The new "Already have an account? Sign in" link sits inside the SafeAreaView bottom inset. In debug builds the Metro warning banner ("Open debugger to view warnings.") is layered on top, so Maestro cannot see the link. Will need a re-run on a release build to verify.

## Issues with the tests themselves (low-priority cleanup)

### A. iOS keyboard auto-correct row contains country names

When you type "Germany" the iOS prediction bar shows a "Germany" autocomplete chip on top of the keyboard, with the same text as the search result row. Maestro's `tapOn: "Germany"` sometimes hits the chip instead of the FlatList row. Two robust fixes:
- Add `testID="search-result-<countryCode>"` to `SearchRow` in `app/(onboarding)/citizenship.tsx` and target by id.
- Pick a country that iOS does not suggest (e.g. Indonesia) for the test.

### B. No `hideKeyboard` support on iOS

`hideKeyboard` fails ("Couldn't hide the keyboard") because the search input has no input accessory view. Use `tapOn` on the search result row directly instead of trying to dismiss the keyboard first.

### C. No testIDs on auth/onboarding inputs

The sign-up flow has to rely on placeholder text matching ("Email" / "Password" / "Confirm Password"), which is fragile because "Password" is a substring of "Confirm Password". Adding `testID` props on the three `TextInput`s in `sign-up.tsx` would make `03-sign-up.yaml` deterministic.

## Suggested fixes I would apply next

1. **Move `requestNotificationPermissions` out of `(tabs)/_layout.tsx`** entirely. It already lives correctly inside `(onboarding)/permissions.tsx`. The tab-mount call is redundant and is the most plausible source of bug #1.
2. **Guard `prefetchAll` against early call** — bail if `db === null` or wrap in try/catch that no-ops on init errors instead of console.error.
3. **Add testIDs** to the three big interactive surfaces I keep hitting:
   - `SearchRow` in `citizenship.tsx`
   - The three `TextInput`s in `sign-up.tsx` and `sign-in.tsx`
   - The CloudyButton submit in `sign-up.tsx`
4. **Investigate the sign-up hang** with focused logs around the `OnboardingContext` migration step.

Tell me which of these you want me to tackle first and I will keep iterating.
