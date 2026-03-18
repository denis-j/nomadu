import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Switch, Text, View , Pressable } from 'react-native';
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
import { usePassport } from '../../../hooks/usePassport';
import { useNotificationPermission } from '../../../hooks/useNotificationPermission';
import { deleteAccount } from '../../../lib/auth';
import { restorePurchases } from '../../../lib/revenueCat';
import { useSync } from '../../../contexts/SyncContext';
import { countryCodeToFlag } from '../../../lib/geocoding';
import { getHasFixedResidence, setHasFixedResidence } from '../../../lib/onboarding';
import { IslandSheet } from '../../../components/IslandSheet';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

export default function SettingsScreen() {
  const { permissions } = useLocation();
  const [trackingSheetVisible, setTrackingSheetVisible] = useState(false);
  const { isPro, expirationDate, productIdentifier, loading } = useSubscription();
  const { user, signOut: handleSignOut } = useAuth();
  const { cloudSyncEnabled, setCloudSyncEnabled, syncStatus, lastSynced, triggerSync } = useSync();
  const { country: passportCountry, countryCode: passportCode } = usePassport();
  const { granted: notificationsGranted } = useNotificationPermission();
  const router = useRouter();
  const [fixedResidence, setFixedResidence] = useState(true);

  useEffect(() => {
    if (user) {
      getHasFixedResidence(user.uid).then((val) => {
        if (val !== null) setFixedResidence(val);
      });
    }
  }, [user]);

  const needsAlwaysPermission = permissions.foreground && !permissions.isAlways;
  const needsAnyPermission = !permissions.foreground;

  const handleDeleteAccount = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account, all trips, and all data — both locally and in the cloud. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error: any) {
              console.error('deleteAccount error:', error);
              if (error?.code === 'auth/requires-recent-login') {
                Alert.alert(
                  'Sign in again',
                  'For security, please sign out and sign in again before deleting your account.',
                );
              } else {
                Alert.alert('Error', `Failed to delete account: ${error?.message ?? error}`);
              }
            }
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
  const [versionTaps, setVersionTaps] = useState(0);

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
    <>
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
                  ? 'Nomady needs location access to automatically track your trips. Tap to open Settings.'
                  : 'For automatic background tracking, please change location access to "Always". Tap to open Settings.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </Glass>
        </Pressable>
      )}

      {/* Notification Permission Warning */}
      {!notificationsGranted && (
        <Pressable onPress={openSettings}>
          <Glass {...glassProps} style={[styles.warningCard, !hasGlass && styles.warningCardFallback]}>
            <View style={styles.warningIconWrap}>
              <Ionicons name="notifications-outline" size={24} color={Colors.warning} />
            </View>
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>Enable Notifications</Text>
              <Text style={styles.warningText}>
                Allow notifications to get visa warnings, tax residency alerts, and city arrival updates. Tap to open Settings.
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
            router.push('/(tabs)/(settings)/passport');
          }}
        >
          <Text style={styles.rowLabel}>Passport</Text>
          <View style={styles.passportValue}>
            <Text style={styles.rowValue}>
              {passportCode ? `${countryCodeToFlag(passportCode)} ${passportCountry}` : 'Not set'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </View>
        </Pressable>
        <View style={styles.separator} />
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>Fixed Residence</Text>
            <Text style={styles.rowDescription}>
              Permanent home in your country
            </Text>
          </View>
          <Switch
            value={fixedResidence}
            onValueChange={(val) => {
              setFixedResidence(val);
              if (user) setHasFixedResidence(user.uid, val);
            }}
          />
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
        {(loading || isPro) && (
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

      {/* Cloud Sync */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>Cloud Sync</Text>
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>Sync to Cloud</Text>
            <Text style={styles.rowDescription}>
              Back up trips and sync across devices
            </Text>
          </View>
          <Switch
            value={cloudSyncEnabled === true}
            onValueChange={setCloudSyncEnabled}
          />
        </View>
        {cloudSyncEnabled && (
          <>
            <View style={styles.separator} />
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Status</Text>
              <Text style={styles.rowValue}>
                {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'error' ? 'Error' : 'Up to date'}
              </Text>
            </View>
            {lastSynced && (
              <>
                <View style={styles.separator} />
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Last synced</Text>
                  <Text style={styles.rowValue}>{formatDate(lastSynced)}</Text>
                </View>
              </>
            )}
            <View style={styles.separator} />
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                triggerSync();
              }}
              disabled={syncStatus === 'syncing'}
            >
              <Text style={[styles.rowLabel, { color: Colors.primary, opacity: syncStatus === 'syncing' ? 0.5 : 1 }]}>
                Sync Now
              </Text>
            </Pressable>
          </>
        )}
      </Glass>

      {/* Location Tracking */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>Location Tracking</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Status</Text>
          <StatusBadge granted={permissions.background} label={permissions.background ? 'Active' : 'Inactive'} />
        </View>
        <View style={styles.separator} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setTrackingSheetVisible(true);
          }}
        >
          <Text style={styles.rowLabel}>How it works</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </Pressable>
      </Glass>

      {/* Account Deletion */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>Danger Zone</Text>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={handleDeleteAccount}
        >
          <Text style={[styles.rowLabel, styles.destructive]}>Delete Account</Text>
        </Pressable>
      </Glass>

      {/* About */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>About</Text>
        <Pressable
          style={styles.row}
          onPress={() => {
            const next = versionTaps + 1;
            setVersionTaps(next);
            if (next >= 5) {
              setVersionTaps(0);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.push('/(tabs)/(settings)/debug');
            } else {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
          }}
        >
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.rowValue}>{appVersion}</Text>
        </Pressable>
        <View style={styles.separator} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Storage</Text>
          <Text style={styles.rowValue}>{cloudSyncEnabled ? 'Local + Cloud' : 'Local only'}</Text>
        </View>
      </Glass>

      <Text style={styles.footer}>
        {cloudSyncEnabled
          ? 'Data is stored locally and synced to the cloud.'
          : 'All data is stored locally on your device.\nNothing is uploaded to any server.'}
      </Text>
    </ScrollView>

      <IslandSheet
        visible={trackingSheetVisible}
        onClose={() => setTrackingSheetVisible(false)}
        title="Location Tracking"
        snapPoint={0.55}
      >
        <View style={styles.sheetContent}>
          <View style={styles.sheetItem}>
            <Ionicons name="battery-half-outline" size={22} color={Colors.primary} />
            <View style={styles.sheetItemText}>
              <Text style={styles.sheetItemTitle}>Battery efficient</Text>
              <Text style={styles.sheetItemDesc}>
                Uses iOS Significant Location Changes — only wakes when you move to a new area.
              </Text>
            </View>
          </View>
          <View style={styles.sheetItem}>
            <Ionicons name="time-outline" size={22} color={Colors.primary} />
            <View style={styles.sheetItemText}>
              <Text style={styles.sheetItemTitle}>Background checks</Text>
              <Text style={styles.sheetItemDesc}>
                Your location is checked roughly every 6–12 hours in the background, only when you move.
              </Text>
            </View>
          </View>
          <View style={styles.sheetItem}>
            <Ionicons name="phone-portrait-outline" size={22} color={Colors.primary} />
            <View style={styles.sheetItemText}>
              <Text style={styles.sheetItemTitle}>Instant on open</Text>
              <Text style={styles.sheetItemDesc}>
                When you open the app, your location is checked immediately so your trips are always up to date.
              </Text>
            </View>
          </View>
          <View style={styles.sheetItem}>
            <Ionicons name="navigate-outline" size={22} color={Colors.primary} />
            <View style={styles.sheetItemText}>
              <Text style={styles.sheetItemTitle}>City-level only</Text>
              <Text style={styles.sheetItemDesc}>
                We only need to know which city and country you're in — no precise GPS tracking.
              </Text>
            </View>
          </View>
          <View style={styles.sheetItem}>
            <Ionicons name="lock-closed-outline" size={22} color={Colors.primary} />
            <View style={styles.sheetItemText}>
              <Text style={styles.sheetItemTitle}>Private by design</Text>
              <Text style={styles.sheetItemDesc}>
                All location data stays on your device. Nothing is sent to external servers.
              </Text>
            </View>
          </View>
        </View>
      </IslandSheet>
    </>
  );
}

function StatusBadge({ granted, label }: { granted: boolean; label?: string }) {
  return (
    <View style={[styles.badge, granted ? styles.badgeGranted : styles.badgeDenied]}>
      <Text style={[styles.badgeText, granted ? styles.badgeTextGranted : styles.badgeTextDenied]}>
        {label ?? (granted ? 'Granted' : 'Not Granted')}
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
  passportValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  // ─── Sheet ───
  sheetContent: {
    gap: 22,
  },
  sheetItem: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  sheetItemText: {
    flex: 1,
    gap: 2,
  },
  sheetItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  sheetItemDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
