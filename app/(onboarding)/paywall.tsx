import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import RevenueCatUI from 'react-native-purchases-ui';
import { useOnboarding } from '../../contexts/OnboardingContext';

export default function OnboardingPaywallScreen() {
  const router = useRouter();
  const { markOnboardingComplete } = useOnboarding();

  const handleCompleted = async () => {
    await markOnboardingComplete();
    router.replace('/(tabs)');
  };

  return (
    <View style={{ flex: 1 }}>
      <RevenueCatUI.Paywall
        onPurchaseCompleted={handleCompleted}
        onRestoreCompleted={handleCompleted}
      />
    </View>
  );
}
