import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function PaywallScreen() {
  const router = useRouter();

  // RevenueCat is disabled in production — close immediately
  useEffect(() => {
    if (!__DEV__) {
      router.back();
    }
  }, []);

  if (!__DEV__) {
    return null;
  }

  const RevenueCatUI = require('react-native-purchases-ui').default;
  return (
    <View style={{ flex: 1 }}>
      <RevenueCatUI.Paywall
        onDismiss={() => router.back()}
        onPurchaseCompleted={() => router.back()}
        onRestoreCompleted={() => router.back()}
      />
    </View>
  );
}
