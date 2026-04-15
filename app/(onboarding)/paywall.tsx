import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { useSubscription } from '../../hooks/useSubscription';

export default function OnboardingPaywallScreen() {
  const router = useRouter();
  const { markOnboardingComplete } = useOnboarding();
  const { refresh } = useSubscription();

  const handleCompleted = async () => {
    await refresh();
    await markOnboardingComplete();
    router.replace('/(tabs)');
  };

  const RevenueCatUI = require('react-native-purchases-ui').default;
  return (
    <View style={{ flex: 1 }}>
      <RevenueCatUI.Paywall
        onPurchaseCompleted={handleCompleted}
        onRestoreCompleted={handleCompleted}
      />
    </View>
  );
}
