import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { track } from '../lib/analytics';

export default function PaywallScreen() {
  const router = useRouter();

  useEffect(() => {
    track({ name: 'paywall_viewed', props: { source: 'app' } });
  }, []);

  const RevenueCatUI = require('react-native-purchases-ui').default;
  return (
    <View style={{ flex: 1 }}>
      <RevenueCatUI.Paywall
        onDismiss={() => router.back()}
        onPurchaseCompleted={() => {
          track({ name: 'purchase_completed', props: { source: 'app' } });
          router.back();
        }}
        onRestoreCompleted={() => {
          track({ name: 'purchase_restored', props: { source: 'app' } });
          router.back();
        }}
      />
    </View>
  );
}
