import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { sendNewCityNotification, checkAndNotifyVisaTax, requestNotificationPermissions } from '../../../lib/notifications';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

type Status = 'idle' | 'loading' | 'done' | 'error';

function DebugButton({
  label,
  sublabel,
  onPress,
  destructive,
}: {
  label: string;
  sublabel?: string;
  onPress: () => Promise<void>;
  destructive?: boolean;
}) {
  const [status, setStatus] = useState<Status>('idle');

  const handle = async () => {
    if (status === 'loading') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStatus('loading');
    try {
      await onPress();
      setStatus('done');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, destructive && styles.buttonDestructive, status === 'done' && styles.buttonDone]}
      onPress={handle}
      activeOpacity={0.7}
    >
      <View style={styles.buttonContent}>
        <Text style={[styles.buttonLabel, destructive && styles.buttonLabelDestructive]}>
          {status === 'loading' ? '...' : status === 'done' ? '✓ Sent' : status === 'error' ? '✗ Error' : label}
        </Text>
        {sublabel && status === 'idle' && (
          <Text style={styles.buttonSublabel}>{sublabel}</Text>
        )}
      </View>
      {status === 'loading' && <ActivityIndicator size="small" color={Colors.textSecondary} />}
    </TouchableOpacity>
  );
}

export default function DebugScreen() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <Text style={styles.warning}>
        🛠 Debug Mode — Internal use only
      </Text>

      {/* Permissions */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>Permissions</Text>
        <DebugButton
          label="Request Notification Permission"
          onPress={requestNotificationPermissions}
        />
      </Glass>

      {/* Experiments */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>Experiments</Text>
        <DebugButton
          label="🏅 Achievement Badges"
          sublabel="3D rotatable medal prototypes"
          onPress={async () => {
            router.push('/debug/badges');
          }}
        />
      </Glass>

      {/* New city */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>Location Notifications</Text>
        <DebugButton
          label="🇹🇭 Arrived in Bangkok"
          sublabel="New city welcome notification"
          onPress={() => sendNewCityNotification('Bangkok', 'Thailand', 'TH')}
        />
        <View style={styles.sep} />
        <DebugButton
          label="🇩🇪 Arrived in Berlin"
          sublabel="New city welcome notification"
          onPress={() => sendNewCityNotification('Berlin', 'Germany', 'DE')}
        />
      </Glass>

      {/* Visa warnings */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>Visa Warnings</Text>
        <DebugButton
          label="Visa heads-up (75%)"
          sublabel="Thailand · 15d of 60d remaining"
          onPress={() => checkAndNotifyVisaTax(
            [{ destination: 'Thailand', destinationCode: 'TH', flag: '🇹🇭', ruleLabel: '60 days visa-free', daysAllowed: 60, daysUsed: 45, daysRemaining: 15, percentUsed: 75, status: 'warning' }],
            [],
          )}
        />
        <View style={styles.sep} />
        <DebugButton
          label="Visa warning (90%)"
          sublabel="Thailand · 6d of 60d remaining"
          onPress={() => checkAndNotifyVisaTax(
            [{ destination: 'Thailand', destinationCode: 'TH_90', flag: '🇹🇭', ruleLabel: '60 days visa-free', daysAllowed: 60, daysUsed: 54, daysRemaining: 6, percentUsed: 90, status: 'critical' }],
            [],
          )}
        />
        <View style={styles.sep} />
        <DebugButton
          label="Visa overstay (100%)"
          sublabel="Thailand · 0d remaining"
          onPress={() => checkAndNotifyVisaTax(
            [{ destination: 'Thailand', destinationCode: 'TH_100', flag: '🇹🇭', ruleLabel: '60 days visa-free', daysAllowed: 60, daysUsed: 61, daysRemaining: 0, percentUsed: 102, status: 'exceeded' }],
            [],
          )}
        />
      </Glass>

      {/* Tax warnings */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>Tax Residence Warnings</Text>
        <DebugButton
          label="Tax alert (75%)"
          sublabel="France · 137 of 183 days"
          onPress={() => checkAndNotifyVisaTax(
            [],
            [{ country: 'France', countryCode: 'FR_75', flag: '🇫🇷', ruleLabel: `183 days in ${new Date().getFullYear()}`, year: new Date().getFullYear(), thresholdDays: 183, daysPresent: 137, daysRemaining: 46, percentUsed: 75, status: 'caution' }],
          )}
        />
        <View style={styles.sep} />
        <DebugButton
          label="Tax warning (90%)"
          sublabel="France · 165 of 183 days"
          onPress={() => checkAndNotifyVisaTax(
            [],
            [{ country: 'France', countryCode: 'FR_90', flag: '🇫🇷', ruleLabel: `183 days in ${new Date().getFullYear()}`, year: new Date().getFullYear(), thresholdDays: 183, daysPresent: 165, daysRemaining: 18, percentUsed: 90, status: 'warning' }],
          )}
        />
        <View style={styles.sep} />
        <DebugButton
          label="Tax resident (100%)"
          sublabel="France · 183+ days reached"
          onPress={() => checkAndNotifyVisaTax(
            [],
            [{ country: 'France', countryCode: 'FR_100', flag: '🇫🇷', ruleLabel: `183 days in ${new Date().getFullYear()}`, year: new Date().getFullYear(), thresholdDays: 183, daysPresent: 185, daysRemaining: 0, percentUsed: 101, status: 'resident' }],
          )}
        />
      </Glass>

      {/* Reset */}
      <Glass {...glassProps} style={[styles.section, !hasGlass && styles.sectionFallback]}>
        <Text style={styles.sectionTitle}>Reset</Text>
        <DebugButton
          label="Clear notification history"
          sublabel="Allows all threshold alerts to fire again"
          destructive
          onPress={async () => {
            const keys = await AsyncStorage.getAllKeys();
            const notifKeys = keys.filter((k) => k.startsWith('notif_'));
            await AsyncStorage.multiRemove(notifKeys);
          }}
        />
      </Glass>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 100,
  },
  warning: {
    ...Typography.bodySmall,
    color: Colors.textTertiary,
    textAlign: 'center',
    paddingVertical: 4,
  },
  section: {
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
    borderCurve: 'continuous',
    gap: 0,
  },
  sectionFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    ...Typography.eyebrow,
    fontSize: 13,
    marginBottom: 12,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: 6,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  buttonDone: {
    opacity: 0.7,
  },
  buttonDestructive: {},
  buttonContent: {
    flex: 1,
    gap: 2,
  },
  buttonLabel: {
    ...Typography.titleSmall,
    fontWeight: '500',
    color: Colors.primary,
  },
  buttonLabelDestructive: {
    color: Colors.error,
  },
  buttonSublabel: {
    ...Typography.caption,
  },
});
