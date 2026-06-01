import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { setCelebrating } from '../../lib/celebration';
import { useSubscription } from '../../hooks/useSubscription';

export default function OnboardingPaywallScreen() {
  const router = useRouter();
  const { isPro } = useSubscription();
  const navigatedRef = useRef(false);

  const goToCelebrate = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    // Flag the celebration FIRST so RootNavigator's customer-info-triggered
    // re-route bails out instead of yanking us to /(tabs).
    setCelebrating(true);
    router.replace('/(onboarding)/celebrate');
  };

  // The RevenueCatUI paywall's onPurchaseCompleted callback is unreliable in
  // some environments (Test Store, simulator), so we also watch isPro directly.
  // The CustomerInfo update listener flips isPro the instant the purchase
  // succeeds, which is the canonical "purchase done" signal.
  useEffect(() => {
    if (isPro) {
      goToCelebrate();
    }
  }, [isPro]);

  const RevenueCatUI = require('react-native-purchases-ui').default;
  return (
    <View style={{ flex: 1 }}>
      <RevenueCatUI.Paywall
        onPurchaseCompleted={goToCelebrate}
        onRestoreCompleted={goToCelebrate}
      />
    </View>
  );
}
