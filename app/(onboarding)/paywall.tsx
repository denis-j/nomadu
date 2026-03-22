import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useOnboarding } from '../../contexts/OnboardingContext';

export default function OnboardingPaywallScreen() {
  const router = useRouter();
  const { markOnboardingComplete } = useOnboarding();

  const handleCompleted = async () => {
    await markOnboardingComplete();
    router.replace('/(tabs)');
  };

  // In production RevenueCat is disabled — skip paywall and complete onboarding immediately
  useEffect(() => {
    if (!__DEV__) {
      handleCompleted();
    }
  }, []);

  if (!__DEV__) {
    return null;
  }

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
