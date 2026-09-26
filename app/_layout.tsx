import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Appearance, LogBox, Platform } from 'react-native';
import SplashScreen from '../components/SplashScreen';
import { OnboardingProvider, useOnboarding } from '../contexts/OnboardingContext';
import { SyncProvider } from '../contexts/SyncContext';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { configureRevenueCat } from '../lib/revenueCat';
import { prefetchAll, prefetchUserData } from '../lib/prefetch';
import { isCelebrating } from '../lib/celebration';
import { ToastContainer } from '../components/Toast';
import { UpdateBanner } from '../components/UpdateBanner';
import { useOTAUpdates } from '../hooks/useOTAUpdates';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Colors } from '../constants/colors';
import { initMonitoring, reportError, setMonitoringUser } from '../lib/monitoring';
import { setAnalyticsUser, trackScreen } from '../lib/analytics';
// Defines the background location task. It has to exist as soon as the JS
// starts: when iOS wakes the app for a move, the update is handed to the task
// right away, and the definition used to wait until the map screen or the
// location hook loaded, behind auth, RevenueCat and the whole first render.
import '../lib/location';
import { ensureLocalDataOwner } from '../lib/localOwner';

// First statement in the module, so a failure anywhere below is still
// reported. Imports are hoisted above this either way, which is why nothing
// with side effects may sit between them and this call.
initMonitoring();

// Suppress noisy non-fatal native warnings that pop the dev LogBox overlay
LogBox.ignoreLogs([
  '[RNScreens] sheetPresentationController is null',
]);

// LogBox sometimes shows native warnings via the error path with a stack trace
// that LogBox.ignoreLogs doesn't filter. Patch console.error directly so the
// RNScreens detents warning never reaches LogBox.
if (__DEV__) {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.includes('sheetPresentationController is null')) {
      return;
    }
    originalError(...args);
  };
}

// Force light mode globally
Appearance.setColorScheme('light');

function RootNavigator() {
  const { user, loading: authLoading } = useAuth();
  const { isPro, loading: subLoading, checkedFor: subCheckedFor } = useSubscription(user?.uid ?? null);
  const { onboardingDone } = useOnboarding();
  const router = useRouter();
  const segments = useSegments();

  // The route pattern ("(tabs)/(plans)/[id]"), never a trip or city id.
  const screenKey = segments.join('/');
  useEffect(() => {
    if (screenKey) trackScreen(screenKey);
  }, [screenKey]);

  useEffect(() => {
    if (authLoading) return;
    // Wait until OnboardingContext has resolved a real boolean from storage,
    // so we don't bounce the user to citizenship and back when they've
    // already completed it under the LOCAL_ONBOARDING_UID placeholder.
    if (onboardingDone === null) return;
    // The entitlement has to be the signed-in account's own answer. Right
    // after sign-in it still describes the anonymous user, and routing on it
    // sent paying customers to the paywall (and on to "welcome to Pro").
    if (user && (subLoading || subCheckedFor !== user.uid)) return;
    // Paywall just kicked off the celebration screen. Keep our hands off the
    // router until the celebrate screen unmounts itself.
    if (isCelebrating()) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';
    // Screens of the onboarding group that only make sense with an account:
    // someone who deletes theirs from the paywall starts over at welcome.
    const screen = (segments as string[])[1];
    const needsAccount = inOnboardingGroup && (screen === 'paywall' || screen === 'celebrate');

    if (!user) {
      // Reverse funnel: the user is allowed to explore onboarding without
      // signing in. Only nudge them to /sign-up once the local onboarding
      // is complete; otherwise drop them into citizenship.
      if (onboardingDone) {
        if (!inAuthGroup) {
          router.replace('/(auth)/sign-up');
        }
      } else if ((!inOnboardingGroup && !inAuthGroup) || needsAccount) {
        router.replace('/(onboarding)/welcome');
      }
    } else if (!onboardingDone) {
      // Signed-in user whose onboarding flag isn't set for this UID
      // (typically a brand-new account or a fresh device).
      if (!inOnboardingGroup) {
        router.replace('/(onboarding)/welcome');
      }
    } else if (!isPro) {
      if (!inOnboardingGroup || screen !== 'paywall') {
        router.replace('/(onboarding)/paywall');
      }
    } else {
      if (inAuthGroup || inOnboardingGroup) {
        router.replace('/(tabs)');
      }
    }
  }, [user, authLoading, segments, onboardingDone, isPro, subLoading, subCheckedFor]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="trip/[id]"
        options={{
          headerShown: false,
          presentation: 'formSheet',
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="city/[key]"
        options={{
          headerShown: false,
          presentation: 'formSheet',
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="paywall"
        options={{
          headerShown: false,
          presentation: 'formSheet',
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="join/[code]"
        options={{
          headerShown: false,
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.75, 1.0],
          // Its own ground: transparent let the map of the screen behind
          // shine through the whole invite.
          contentStyle: { backgroundColor: Colors.background },
        }}
      />
      <Stack.Screen
        name="debug/badges"
        options={{
          title: 'Badges (Debug)',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="badge/[countryCode]"
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="library/badges"
        options={{
          title: 'Badge Library',
          headerShown: true,
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [userDataReady, setUserDataReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const { isUpdatePending, applyUpdate } = useOTAUpdates();

  useEffect(() => {
    Promise.all([configureRevenueCat(), prefetchAll()]).then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    // The local data has to be this account's before anything reads it; a
    // different account's rows are wiped here, and the caches filled before
    // sign-in are refilled from what is left.
    ensureLocalDataOwner(uid)
      .then((wiped) => (wiped ? prefetchAll() : undefined))
      .catch((err) => reportError(err, 'local-owner'))
      .then(() => prefetchUserData(uid))
      .then(() => setUserDataReady(true));
  }, [user?.uid]);

  // Tag reports with the signed-in user (uid only, never the email address).
  useEffect(() => {
    setMonitoringUser(user?.uid ?? null);
    setAnalyticsUser(user?.uid ?? null);
  }, [user?.uid]);

  const appReady = ready && !authLoading && (!user || userDataReady);

  // Android's window starts in the splash blue (app.json), so the moment
  // between the system splash and ours is not black. Once ours is gone the
  // window goes back to the app's own ground, which shows at screen edges.
  useEffect(() => {
    if (!showSplash && Platform.OS === 'android') {
      // Loaded here, not imported: iOS never needs it, and a build without
      // the native module would crash on the import alone.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('expo-system-ui') as typeof import('expo-system-ui'))
        .setBackgroundColorAsync(Colors.background)
        .catch(() => {});
    }
  }, [showSplash]);

  return (
    <ErrorBoundary>
      {/* The app is always light. Screens that set their own style still win
          while they are open; once none is left, Android fell back to white
          icons, invisible on the white tab screens (iOS defaults to dark). */}
      <StatusBar style="dark" />
      {appReady && (
        <OnboardingProvider>
          <SyncProvider>
            <RootNavigator />
          </SyncProvider>
        </OnboardingProvider>
      )}
      {showSplash && (
        <SplashScreen ready={appReady} onDone={() => setShowSplash(false)} />
      )}
      <UpdateBanner visible={isUpdatePending} onApply={applyUpdate} />
      <ToastContainer />
    </ErrorBoundary>
  );
}
