import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { Appearance, LogBox } from 'react-native';
import { useFonts, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';

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
import SplashScreen from '../components/SplashScreen';
import { OnboardingProvider, useOnboarding } from '../contexts/OnboardingContext';
import { SyncProvider } from '../contexts/SyncContext';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { configureRevenueCat, identifyUser } from '../lib/revenueCat';
import { prefetchAll, prefetchUserData } from '../lib/prefetch';
import { ToastContainer } from '../components/Toast';

// Force light mode globally
Appearance.setColorScheme('light');

function RootNavigator() {
  const { user, loading: authLoading } = useAuth();
  const { isPro, loading: subLoading } = useSubscription();
  const { onboardingDone } = useOnboarding();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (authLoading) return;
    // Wait until OnboardingContext has resolved a real boolean from storage,
    // so we don't bounce the user to citizenship and back when they've
    // already completed it under the LOCAL_ONBOARDING_UID placeholder.
    if (onboardingDone === null) return;
    if (user && subLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';

    if (!user) {
      // Reverse funnel: the user is allowed to explore onboarding without
      // signing in. Only nudge them to /sign-up once the local onboarding
      // is complete; otherwise drop them into citizenship.
      if (onboardingDone) {
        if (!inAuthGroup) {
          router.replace('/(auth)/sign-up');
        }
      } else if (!inOnboardingGroup && !inAuthGroup) {
        router.replace('/(onboarding)/welcome');
      }
    } else if (!onboardingDone) {
      // Signed-in user whose onboarding flag isn't set for this UID
      // (typically a brand-new account or a fresh device).
      identifyUser(user.uid);
      if (!inOnboardingGroup) {
        router.replace('/(onboarding)/welcome');
      }
    } else if (!isPro) {
      identifyUser(user.uid);
      if (segments[0] !== '(onboarding)' || segments[1] !== 'paywall') {
        router.replace('/(onboarding)/paywall');
      }
    } else {
      identifyUser(user.uid);
      if (inAuthGroup || inOnboardingGroup) {
        router.replace('/(tabs)');
      }
    }
  }, [user, authLoading, segments, onboardingDone, isPro, subLoading]);

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
  const [fontsLoaded] = useFonts({ InstrumentSerif_400Regular_Italic });

  useEffect(() => {
    Promise.all([configureRevenueCat(), prefetchAll()]).then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!user) return;
    prefetchUserData(user.uid).then(() => setUserDataReady(true));
  }, [user?.uid]);

  const appReady = ready && fontsLoaded && !authLoading && (!user || userDataReady);

  return (
    <>
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
      <ToastContainer />
    </>
  );
}
