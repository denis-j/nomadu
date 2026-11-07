import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, ScrollView, StyleSheet, Switch, Text, View , Pressable } from 'react-native';
import { showToast } from '../../../lib/toast';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { useAuth } from '../../../hooks/useAuth';
import { useLocation } from '../../../hooks/useLocation';
import { useSubscription } from '../../../hooks/useSubscription';
import { usePassport } from '../../../hooks/usePassport';
import { useNotificationPermission } from '../../../hooks/useNotificationPermission';
import { deleteAccount } from '../../../lib/auth';
import { clearAllTravelData, startRealtimeSync } from '../../../lib/sync';
import { useSync } from '../../../contexts/SyncContext';
import { Flag } from '../../../components/Flag';
import { LanguageSwitcher } from '../../../components/LanguageSwitcher';
import { HIDEABLE_TABS, useHiddenTabs } from '../../../hooks/useHiddenTabs';
import { useTranslation } from '../../../contexts/LanguageContext';
import { getHasFixedResidence, setHasFixedResidence } from '../../../lib/onboarding';
import { Avatar } from '../../../components/TravellerAvatars';
import { useProfile } from '../../../lib/profile';
import { avatarSeed } from '../../../lib/avatarSeed';
import { formatMoment } from '../../../lib/days';
import { IMPRINT_URL, PRIVACY_URL, TERMS_URL, openLegal } from '../../../constants/legal';
import { appLocale } from '../../../lib/i18n/locale';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

export default function SettingsScreen() {
  const { t, countryName } = useTranslation();
  const hiddenTabs = useHiddenTabs();
  const { permissions } = useLocation();
  const { isPro, expirationDate, productIdentifier } = useSubscription();
  const { user, signOut: handleSignOut } = useAuth();
  const profile = useProfile(user?.uid ?? null);
  const { syncStatus, lastSynced, triggerSync } = useSync();
  const { country: passportCountry, countryCode: passportCode } = usePassport();
  const { granted: notificationsGranted } = useNotificationPermission();
  const router = useRouter();
  const [fixedResidence, setFixedResidence] = useState(true);
  const [isClearing, setIsClearing] = useState(false);

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

    // Deleting the account does not touch the store subscription: that is
    // billed by Apple/Google, not by us, and keeps renewing until the user
    // cancels it there. Saying so is both fair and something App Review looks
    // for on apps that combine subscriptions with account deletion.
    const store = Platform.OS === 'ios' ? t('settings.appStore') : t('settings.googlePlay');
    const message =
      t('settings.deleteBody') +
      (isPro
        ? t('settings.deleteSubWarning', { store })
        : '');

    Alert.alert(
      t('settings.deleteAccount'),
      message,
      [
        { text: t('common.cancel'), style: 'cancel' },
        ...(isPro
          ? [{ text: t('settings.manageSubscription'), onPress: handleManageSubscription }]
          : []),
        {
          text: t('settings.deleteAccount'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error: any) {
              // deleteAccount() only rejects when nothing was deleted, so the
              // account is still intact and retrying is safe. Its message is
              // already written for the user.
              console.error('deleteAccount error:', error);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert(t('settings.accountNotDeleted'), error?.message ?? t('settings.tryAgain'));
            }
          },
        },
      ],
    );
  };

  const handleManageSubscription = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (__DEV__) {
        const RevenueCatUI = require('react-native-purchases-ui').default;
        await RevenueCatUI.presentCustomerCenter();
      } else {
        if (Platform.OS === 'ios') {
          Linking.openURL('https://apps.apple.com/account/subscriptions');
        } else {
          Linking.openURL('https://play.google.com/store/account/subscriptions');
        }
      }
    } catch {
      if (Platform.OS === 'ios') {
        Linking.openURL('https://apps.apple.com/account/subscriptions');
      } else {
        Linking.openURL('https://play.google.com/store/account/subscriptions');
      }
    }
  };

  const openSettings = () => {
    Linking.openSettings();
  };

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const [versionTaps, setVersionTaps] = useState(0);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString(appLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const planLabel = () => {
    if (!productIdentifier) return t('settings.planPro');
    if (productIdentifier.includes('lifetime')) return t('settings.planLifetime');
    if (productIdentifier.includes('yearly')) return t('settings.planYearly');
    if (productIdentifier.includes('monthly')) return t('settings.planMonthly');
    return t('settings.planPro');
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
                {needsAnyPermission ? t('settings.locReqTitle') : t('settings.locAlwaysTitle')}
              </Text>
              <Text style={styles.warningText}>
                {needsAnyPermission
                  ? t('settings.locReqBody')
                  : t('settings.locAlwaysBody')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </Glass>
        </Pressable>
      )}

      {/* Notification Permission Warning */}
      {!notificationsGranted && (
        <Pressable onPress={openSettings}>
          <Glass {...glassProps} style={[styles.cloudCard, !hasGlass && styles.cloudCardFallback]}>
            <Image
              source={require('../../../assets/icons/bell.png')}
              style={styles.cloudCardIcon}
              resizeMode="contain"
            />
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>{t('settings.enableNotif')}</Text>
              <Text style={styles.warningText}>
                {t('settings.enableNotifBody')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </Glass>
        </Pressable>
      )}

      {/* Account */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/(tabs)/(settings)/profile');
          }}
          accessibilityRole="button"
          accessibilityLabel={t('settings.editProfile')}
        >
          <View style={styles.profileRow}>
            <Avatar
              person={{ label: profile?.name || t('settings.you'), account: true, owner: false, seed: profile?.avatar ?? avatarSeed(user?.uid) }}
              size={40}
              animated
            />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>{profile?.name || t('settings.yourName')}</Text>
              <Text style={styles.rowDescription}>{t('settings.nameDesc')}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </Pressable>
        <View style={styles.separator} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.email')}</Text>
          <Text style={[styles.rowValue, styles.emailValue]} numberOfLines={1} ellipsizeMode="middle">{user?.email ?? t('settings.notSet')}</Text>
        </View>
        <View style={styles.separator} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/(tabs)/(settings)/passport');
          }}
        >
          <Text style={styles.rowLabel}>{t('settings.passport')}</Text>
          <View style={styles.passportValue}>
            {passportCode ? (
              <>
                <Flag code={passportCode} size={18} />
                <Text style={styles.rowValue}>{countryName(passportCountry)}</Text>
              </>
            ) : (
              <Text style={styles.rowValue}>{t('settings.notSet')}</Text>
            )}
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </View>
        </Pressable>
        <View style={styles.separator} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/(tabs)/(settings)/agent');
          }}
        >
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>{t('settings.aiAgent')}</Text>
            <Text style={styles.rowDescription}>{t('settings.aiAgentDesc')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </Pressable>
        <View style={styles.separator} />
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>{t('settings.fixedResidence')}</Text>
            <Text style={styles.rowDescription}>
              {t('settings.fixedResidenceDesc')}
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
            Alert.alert(t('settings.signOut'), t('settings.signOutConfirm'), [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('settings.signOut'),
                style: 'destructive',
                onPress: handleSignOut,
              },
            ]);
          }}
        >
          <Text style={[styles.rowLabel, styles.destructive]}>{t('settings.signOut')}</Text>
        </Pressable>
      </Glass>

      {/* Preferences */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>{t('settings.preferences')}</Text>
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>{t('language.title')}</Text>
            <Text style={styles.rowDescription}>{t('language.subtitle')}</Text>
          </View>
          <LanguageSwitcher variant="inline" />
        </View>
        <View style={styles.separator} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/(tabs)/(settings)/tabs');
          }}
        >
          <Text style={styles.rowLabel}>{t('settings.tabs')}</Text>
          <View style={styles.tabsValue}>
            <Text style={styles.rowValue}>
              {hiddenTabs.length === 0
                ? t('settings.tabsAll')
                : t('settings.tabsCount', { n: HIDEABLE_TABS.length - hiddenTabs.length, total: HIDEABLE_TABS.length })}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </View>
        </Pressable>
      </Glass>

      {/* Subscription */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>{t('settings.subscription')}</Text>
        {/* Only Pro reaches the tabs: everyone else is on the paywall (app/_layout.tsx),
            which also offers restoring a purchase. */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.plan')}</Text>
          <View style={[styles.badge, styles.badgeGranted]}>
            <Text style={[styles.badgeText, styles.badgeTextGranted]}>{planLabel()}</Text>
          </View>
        </View>
        {expirationDate && (
          <>
            <View style={styles.separator} />
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('settings.renews')}</Text>
              <Text style={styles.rowValue}>{formatDate(expirationDate)}</Text>
            </View>
          </>
        )}
        <View style={styles.separator} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={handleManageSubscription}
        >
          <Text style={[styles.rowLabel, { color: Colors.primary }]}>{t('settings.manageSubscription')}</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </Pressable>
      </Glass>

      {/* Cloud Sync */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>{t('settings.cloudSync')}</Text>
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>{t('settings.backedUp')}</Text>
            <Text style={styles.rowDescription}>
              {t('settings.backedUpDesc')}
            </Text>
          </View>
        </View>
        <View style={styles.separator} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.status')}</Text>
          <Text style={styles.rowValue}>
            {syncStatus === 'syncing' ? t('settings.syncing') : syncStatus === 'error' ? t('settings.waitingConnection') : t('settings.upToDate')}
          </Text>
        </View>
        {lastSynced && (
          <>
            <View style={styles.separator} />
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('settings.lastSynced')}</Text>
              <Text style={styles.rowValue}>{formatMoment(lastSynced)}</Text>
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
            {t('settings.syncNow')}
          </Text>
        </Pressable>
      </Glass>

      {/* Location Tracking */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>{t('settings.locationTracking')}</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.status')}</Text>
          <StatusBadge granted={permissions.background} label={permissions.background ? t('settings.active') : t('settings.inactive')} />
        </View>
        <View style={styles.separator} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/(tabs)/(settings)/location-info');
          }}
        >
          <Text style={styles.rowLabel}>{t('settings.howItWorks')}</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </Pressable>
      </Glass>

      {/* Danger Zone */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>{t('settings.dangerZone')}</Text>
        <Pressable
          disabled={isClearing}
          style={({ pressed }) => [styles.row, pressed && !isClearing && styles.rowPressed]}
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert(
              t('settings.clearDataTitle'),
              t('settings.clearDataBody'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('settings.clearData'),
                  style: 'destructive',
                  onPress: async () => {
                    setIsClearing(true);
                    try {
                      await clearAllTravelData(user?.uid ?? null);
                      if (user) startRealtimeSync(user.uid);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      showToast(t('settings.travelDataCleared'));
                    } catch (error: any) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                      showToast(t('settings.failedToClear', { error: error?.message ?? error }), 'error');
                    } finally {
                      setIsClearing(false);
                    }
                  },
                },
              ],
            );
          }}
        >
          <Text style={[styles.rowLabel, styles.destructive, isClearing && styles.rowLabelMuted]}>
            {isClearing ? t('settings.clearing') : t('settings.clearDataTitle')}
          </Text>
          {isClearing && <ActivityIndicator size="small" color={Colors.error} />}
        </Pressable>
        <View style={styles.separator} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={handleDeleteAccount}
        >
          <Text style={[styles.rowLabel, styles.destructive]}>{t('settings.deleteAccount')}</Text>
        </Pressable>
      </Glass>

      {/* About */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>{t('settings.about')}</Text>
        <Pressable
          style={styles.row}
          onPress={() => {
            // The debug screen only exists in development builds.
            if (!__DEV__) return;
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
          <Text style={styles.rowLabel}>{t('settings.version')}</Text>
          <Text style={styles.rowValue}>{appVersion}</Text>
        </Pressable>
        <View style={styles.separator} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('settings.storage')}</Text>
          <Text style={styles.rowValue}>{t('settings.localCloud')}</Text>
        </View>
        <View style={styles.separator} />
        <Pressable style={styles.row} onPress={() => openLegal(PRIVACY_URL)} accessibilityRole="link">
          <Text style={styles.rowLabel}>{t('settings.privacyPolicy')}</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </Pressable>
        <View style={styles.separator} />
        <Pressable style={styles.row} onPress={() => openLegal(TERMS_URL)} accessibilityRole="link">
          <Text style={styles.rowLabel}>{t('settings.termsOfUse')}</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </Pressable>
        <View style={styles.separator} />
        <Pressable style={styles.row} onPress={() => openLegal(IMPRINT_URL)} accessibilityRole="link">
          <Text style={styles.rowLabel}>{t('settings.legalNotice')}</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </Pressable>
      </Glass>

      <Text style={styles.footer}>
        {t('settings.footer')}
      </Text>
    </ScrollView>

    </>
  );
}

function StatusBadge({ granted, label }: { granted: boolean; label?: string }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.badge, granted ? styles.badgeGranted : styles.badgeDenied]}>
      <Text style={[styles.badgeText, granted ? styles.badgeTextGranted : styles.badgeTextDenied]}>
        {label ?? (granted ? t('settings.granted') : t('settings.notGranted'))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
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
  cloudCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(77,193,255,0.55)',
    backgroundColor: 'rgba(138,211,255,0.22)',
  },
  cloudCardFallback: {
    backgroundColor: 'rgba(138,211,255,0.22)',
  },
  cloudCardIcon: {
    width: 44,
    height: 44,
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
    ...Typography.button,
  },
  warningText: {
    ...Typography.bodySmall,
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
  sectionTitle: { ...Typography.sectionLabel, marginBottom: 12 },
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
    ...Typography.titleSmall,
    fontWeight: '400',
  },
  tabsValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowDescription: {
    ...Typography.bodySmall,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  rowValue: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  emailValue: {
    flexShrink: 1,
    marginLeft: 16,
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
  rowLabelMuted: {
    opacity: 0.55,
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
    ...Typography.caption,
    fontWeight: '600',
  },
  badgeTextGranted: {
    color: Colors.success,
  },
  badgeTextDenied: {
    color: Colors.warning,
  },
  footer: {
    ...Typography.bodySmall,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  // ─── Upgrade Button ───
  // ─── Sheet ───
});
