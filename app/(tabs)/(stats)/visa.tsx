import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useVisaTracker } from '../../../hooks/useVisaTracker';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { countryCodeToFlag } from '../../../lib/geocoding';
import { EmptyState } from '../../../components/EmptyState';
import { VisaStatus } from '../../../lib/visaCalculations';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

function getProgressColor(percent: number): string {
  if (percent > 85) return Colors.error;
  if (percent > 67) return Colors.warning;
  return Colors.success;
}

function getStatusLabel(status: VisaStatus['status']): string {
  switch (status) {
    case 'exceeded': return 'Exceeded';
    case 'critical': return 'Critical';
    case 'warning': return 'Warning';
    case 'ok': return 'OK';
  }
}

function getStatusColor(status: VisaStatus['status']): string {
  switch (status) {
    case 'exceeded': return Colors.error;
    case 'critical': return Colors.error;
    case 'warning': return Colors.warning;
    case 'ok': return Colors.success;
  }
}

function VisaCard({ visa }: { visa: VisaStatus }) {
  const progressColor = getProgressColor(visa.percentUsed);
  const statusColor = getStatusColor(visa.status);
  const progressWidth = Math.min(visa.percentUsed, 100);

  return (
    <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitle}>
          <Text style={styles.flag}>{visa.flag}</Text>
          <View style={styles.titleText}>
            <Text style={styles.destination}>{visa.destination}</Text>
            <Text style={styles.ruleLabel}>{visa.ruleLabel}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {getStatusLabel(visa.status)}
          </Text>
        </View>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressBar,
              { width: `${progressWidth}%`, backgroundColor: progressColor },
            ]}
          />
        </View>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.daysText}>
          <Text style={styles.daysUsed}>{visa.daysUsed}</Text>
          <Text style={styles.daysOf}> of </Text>
          <Text style={styles.daysAllowed}>{visa.daysAllowed}</Text>
          <Text style={styles.daysOf}> days used</Text>
        </Text>
        <Text style={[styles.daysRemaining, { color: progressColor }]}>
          {visa.daysRemaining}d left
        </Text>
      </View>
    </Glass>
  );
}

export default function VisaScreen() {
  const { visaStatuses, loading, citizenshipCode, citizenshipCountry, refresh } = useVisaTracker();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([refresh(), new Promise((r) => setTimeout(r, 800))]);
    setRefreshing(false);
  }, [refresh]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!citizenshipCode) {
    return (
      <EmptyState
        icon="🛂"
        title="No citizenship set"
        subtitle="Set your citizenship in Settings to see visa tracking."
      />
    );
  }

  if (visaStatuses.length === 0) {
    return (
      <EmptyState
        icon="🌍"
        title="No visa rules found"
        subtitle="Visit countries with known visa rules to see tracking here."
      />
    );
  }

  const citizenshipFlag = citizenshipCode ? countryCodeToFlag(citizenshipCode) : '';

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <Text style={styles.subtitle}>
        Based on {citizenshipFlag} {citizenshipCountry} passport
      </Text>

      {visaStatuses.map((visa) => (
        <VisaCard key={visa.destinationCode} visa={visa} />
      ))}

      <Text style={styles.disclaimer}>
        Visa rules are approximate and may change. Always verify with official sources before traveling.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 100,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitle: {
    ...Typography.bodySmall,
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
    paddingLeft: 4,
    marginBottom: 4,
  },
  card: {
    borderRadius: 20,
    padding: 18,
    overflow: 'hidden',
    borderCurve: 'continuous',
    gap: 14,
  },
  cardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  flag: {
    fontSize: 32,
  },
  titleText: {
    flex: 1,
    gap: 2,
  },
  destination: {
    ...Typography.bodyLarge,
    fontWeight: '700',
  },
  ruleLabel: {
    ...Typography.label,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderCurve: 'continuous',
  },
  statusText: {
    ...Typography.caption,
    fontWeight: '700',
  },
  progressContainer: {
    gap: 6,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceSecondary,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  daysText: {
    ...Typography.bodySmall,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  daysUsed: {
    fontWeight: '700',
    color: Colors.text,
  },
  daysOf: {
    fontWeight: '400',
    color: Colors.textSecondary,
  },
  daysAllowed: {
    fontWeight: '600',
    color: Colors.text,
  },
  daysRemaining: {
    ...Typography.button,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  disclaimer: {
    ...Typography.caption,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    lineHeight: 18,
  },
});
