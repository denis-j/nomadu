import { Alert, Linking, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import RevenueCatUI from 'react-native-purchases-ui';
import { Colors } from '../../../constants/colors';
import { useAuth } from '../../../hooks/useAuth';
import { useLocation } from '../../../hooks/useLocation';
import { useSubscription } from '../../../hooks/useSubscription';
import { clearAllData } from '../../../lib/database';
import { restorePurchases } from '../../../lib/revenueCat';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

export default function SettingsScreen() {
  const { permissions, tracking, toggleTracking } = useLocation();
  const { isPro, expirationDate, productIdentifier, loading } = useSubscription();
  const { user, signOut: handleSignOut } = useAuth();
  const router = useRouter();

  const needsAlwaysPermission = permissions.foreground && !permissions.isAlways;
  const needsAnyPermission = !permissions.foreground;

  const handleClearData = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all your trips and visit history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  };

  const handleUpgrade = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/paywall');
  };

  const handleManageSubscription = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await RevenueCatUI.presentCustomerCenter();
    } catch {
      // Fallback: open platform subscription management
      if (Platform.OS === 'ios') {
        Linking.openURL('https://apps.apple.com/account/subscriptions');
      } else {
        Linking.openURL('https://play.google.com/store/account/subscriptions');
      }
    }
  };

  const handleRestore = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await restorePurchases();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Restored', 'Your purchases have been restored.');
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Restore Failed', 'Could not restore purchases. Please try again.');
    }
  };

  const openSettings = () => {
    Linking.openSettings();
  };

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const planLabel = () => {
    if (!productIdentifier) return 'Pro';
    if (productIdentifier.includes('lifetime')) return 'Lifetime';
    if (productIdentifier.includes('yearly')) return 'Yearly';
    if (productIdentifier.includes('monthly')) return 'Monthly';
    return 'Pro';
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      {/* Permission Warning */}
      {(needsAlwaysPermission || needsAnyPermission) && (
        <Pressable onPress={openSettings}>
          <Glass {...glassProps} style={[styles.warningCard, !hasGlass && styles.warningCardFallback]}>
            <View style={styles.warningIconWrap}>
              <Ionicons name="location-outline" size={24} color={Colors.warning} />
            </View>
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>
                {needsAnyPermission ? 'Location Access Required' : 'Always Allow Location'}
              </Text>
              <Text style={styles.warningText}>
                {needsAnyPermission
                  ? 'Nomad needs location access to automatically track your trips. Tap to open Settings.'
                  : 'For automatic background tracking, please change location access to "Always". Tap to open Settings.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </Glass>
        </Pressable>
      )}

      {/* Account */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Email</Text>
          <Text style={styles.rowValue}>{user?.email ?? '—'}</Text>
        </View>
        <View style={styles.separator} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign Out',
                style: 'destructive',
                onPress: handleSignOut,
              },
            ]);
          }}
        >
          <Text style={[styles.rowLabel, styles.destructive]}>Sign Out</Text>
        </Pressable>
      </Glass>

      {/* Subscription */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>Subscription</Text>
        {!loading && !isPro && (
          <>
            <Pressable
              style={({ pressed }) => [styles.upgradeButton, pressed && styles.upgradeButtonPressed]}
              onPress={handleUpgrade}
            >
              <View style={styles.upgradeContent}>
                <Ionicons name="star" size={20} color="#FFF" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.upgradeTitle}>Upgrade to Pro</Text>
                  <Text style={styles.upgradeSubtitle}>Unlock all features</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
              </View>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={handleRestore}
            >
              <Text style={[styles.rowLabel, { color: Colors.primary }]}>Restore Purchases</Text>
            </Pressable>
          </>
        )}
        {!loading && isPro && (
          <>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Plan</Text>
              <View style={[styles.badge, styles.badgeGranted]}>
                <Text style={[styles.badgeText, styles.badgeTextGranted]}>{planLabel()}</Text>
              </View>
            </View>
            {expirationDate && (
              <>
                <View style={styles.separator} />
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Renews</Text>
                  <Text style={styles.rowValue}>{formatDate(expirationDate)}</Text>
                </View>
              </>
            )}
            <View style={styles.separator} />
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={handleManageSubscription}
            >
              <Text style={[styles.rowLabel, { color: Colors.primary }]}>Manage Subscription</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
            </Pressable>
          </>
        )}
      </Glass>

      {/* Tracking */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>Location Tracking</Text>
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>Background Tracking</Text>
            <Text style={styles.rowDescription}>
              Automatically log cities as you travel
            </Text>
          </View>
          <Switch value={tracking} onValueChange={toggleTracking} />
        </View>
      </Glass>

      {/* Permissions */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>Permissions</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Foreground Location</Text>
          <StatusBadge granted={permissions.foreground} />
        </View>
        <View style={styles.separator} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Background Location</Text>
          <StatusBadge granted={permissions.background} />
        </View>
      </Glass>

      {/* Data */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>Data</Text>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={handleClearData}
        >
          <Text style={[styles.rowLabel, styles.destructive]}>Clear All Data</Text>
        </Pressable>
      </Glass>

      {/* About */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Version</Text>
          <Text selectable style={styles.rowValue}>{appVersion}</Text>
        </View>
        <View style={styles.separator} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Storage</Text>
          <Text style={styles.rowValue}>Local only</Text>
        </View>
      </Glass>

      <Text style={styles.footer}>
        All data is stored locally on your device.{'\n'}Nothing is uploaded to any server.
      </Text>
    </ScrollView>
  );
}

function StatusBadge({ granted }: { granted: boolean }) {
  return (
    <View style={[styles.badge, granted ? styles.badgeGranted : styles.badgeDenied]}>
      <Text style={[styles.badgeText, granted ? styles.badgeTextGranted : styles.badgeTextDenied]}>
        {granted ? 'Granted' : 'Not Granted'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 100,
  },
  // ─── Warning Card ───
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: Colors.warning + '40',
  },
  warningCardFallback: {
    backgroundColor: Colors.warning + '0A',
  },
  warningIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.warning + '18',
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  warningContent: {
    flex: 1,
    gap: 3,
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  warningText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  // ─── Sections ───
  section: {
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  sectionFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowContent: {
    flex: 1,
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 16,
    color: Colors.text,
  },
  rowDescription: {
    fontSize: 13,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  rowValue: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  destructive: {
    color: Colors.error,
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeGranted: {
    backgroundColor: Colors.success + '18',
  },
  badgeDenied: {
    backgroundColor: Colors.warning + '18',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeTextGranted: {
    color: Colors.success,
  },
  badgeTextDenied: {
    color: Colors.warning,
  },
  footer: {
    fontSize: 13,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  // ─── Upgrade Button ───
  upgradeButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderCurve: 'continuous',
  },
  upgradeButtonPressed: {
    opacity: 0.85,
  },
  upgradeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  upgradeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  upgradeSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
  },
});
