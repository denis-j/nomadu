import { View } from 'react-native';
import { useRouter } from 'expo-router';

export default function PaywallScreen() {
  const router = useRouter();

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
