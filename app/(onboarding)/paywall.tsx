import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { useSubscription } from '../../hooks/useSubscription';
import { useAuth } from '../../hooks/useAuth';
import { getOnboardingGoal } from '../../lib/onboarding';

function landingRouteForGoal(goal: Awaited<ReturnType<typeof getOnboardingGoal>>): string {
  switch (goal) {
    case 'tax': return '/(tabs)/(stats)/tax';
    case 'visa': return '/(tabs)/(stats)/visa';
    case 'history': return '/(tabs)/(timeline)';
    default: return '/(tabs)';
  }
}

export default function OnboardingPaywallScreen() {
  const router = useRouter();
  const { markOnboardingComplete } = useOnboarding();
  const { refresh } = useSubscription();
  const { user } = useAuth();

  const handleCompleted = async () => {
    await refresh();
    await markOnboardingComplete();
    const goal = user ? await getOnboardingGoal(user.uid) : null;
    router.replace(landingRouteForGoal(goal) as never);
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
