import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { Appearance } from 'react-native';
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
    if (user && onboardingDone === null) return;
    if (user && subLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';

    if (!user) {
      if (!inAuthGroup) {
        router.replace('/(auth)/sign-in');
      }
    } else if (!onboardingDone) {
      identifyUser(user.uid);
      if (!inOnboardingGroup) {
        router.replace('/(onboarding)/citizenship');
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
    </Stack>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [userDataReady, setUserDataReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    Promise.all([configureRevenueCat(), prefetchAll()]).then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!user) return;
    prefetchUserData(user.uid).then(() => setUserDataReady(true));
  }, [user?.uid]);

  const appReady = ready && !authLoading && (!user || userDataReady);

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
