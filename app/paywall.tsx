import { View } from 'react-native';
import { useRouter } from 'expo-router';
import RevenueCatUI from 'react-native-purchases-ui';

export default function PaywallScreen() {
  const router = useRouter();

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
