import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { setCelebrating } from '../../lib/celebration';
import { publishEntitlement, useSubscription } from '../../hooks/useSubscription';
import { useAuth } from '../../hooks/useAuth';
import { deleteAccount } from '../../lib/auth';
import { entitlementOf, rememberEntitlement, type CustomerInfo } from '../../lib/revenueCat';
import { Colors } from '../../constants/colors';
import { track } from '../../lib/analytics';
import { useTranslation } from '../../contexts/LanguageContext';
import { FontSize } from '../../constants/typography';

export default function OnboardingPaywallScreen() {
  const router = useRouter();
  const { isPro } = useSubscription();
  const { t } = useTranslation();
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

  useEffect(() => {
    track({ name: 'paywall_viewed', props: { source: 'onboarding' } });
  }, []);

  const RevenueCatUI = require('react-native-purchases-ui').default;
  return (
    <View style={{ flex: 1 }}>
      <RevenueCatUI.Paywall
        onPurchaseCompleted={() => {
          track({ name: 'purchase_completed', props: { source: 'onboarding' } });
          goToCelebrate();
        }}
        onRestoreCompleted={({ customerInfo }: { customerInfo: CustomerInfo }) => {
          // Also called when the restore found nothing. Celebrating that sent
          // people to the confetti and straight back here.
          const restored = entitlementOf(customerInfo);
          if (!restored.isActive) {
            Alert.alert(t('onboarding.paywall.noPlanTitle'), t('onboarding.paywall.noPlanBody'));
            return;
          }
          track({ name: 'purchase_restored', props: { source: 'onboarding' } });
          // Flags the celebration first, so the router leaves it alone once the
          // answer below reaches it.
          goToCelebrate();
          publishEntitlement({ ...restored, verified: true });
          rememberEntitlement(restored);
        }}
      />
      <AccountButton />
    </View>
  );
}

/**
 * Everyone signed in without Pro lands here, and the paywall has no way out.
 * Someone in the wrong account could not sign out, and someone who made an
 * account could not delete it without paying first, which App Review asks
 * for (guideline 5.1.1(v)). Top right, clear of the paywall's own buttons.
 */
function AccountButton() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  if (!user) return null;

  const confirmDelete = () => {
    Alert.alert(
      t('onboarding.paywall.deleteAccount'),
      t('onboarding.paywall.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('onboarding.paywall.deleteAccount'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert(t('onboarding.paywall.notDeletedTitle'), error?.message ?? t('onboarding.paywall.tryAgain'));
            }
          },
        },
      ],
    );
  };

  const open = () => {
    Haptics.selectionAsync();
    Alert.alert(t('onboarding.paywall.account'), user.email ? t('onboarding.paywall.signedInAs', { email: user.email }) : undefined, [
      { text: t('onboarding.paywall.signOut'), onPress: () => { signOut(); } },
      { text: t('onboarding.paywall.deleteAccount'), style: 'destructive', onPress: confirmDelete },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={t('onboarding.paywall.account')}
      hitSlop={10}
      style={({ pressed }) => [styles.account, { top: insets.top + 8 }, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.accountText}>{t('onboarding.paywall.account')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  account: {
    position: 'absolute',
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.whiteAlpha75,
  },
  accountText: { fontSize: FontSize.subheadline, fontWeight: '600', color: Colors.text },
});
