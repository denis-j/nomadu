import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTaxTracker } from '../../../hooks/useTaxTracker';
import { Colors } from '../../../constants/colors';
import { countryCodeToFlag } from '../../../lib/geocoding';
import { EmptyState } from '../../../components/EmptyState';
import { YearPicker } from '../../../components/YearPicker';
import { TaxStatus } from '../../../lib/taxCalculations';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

function getProgressColor(percent: number): string {
  if (percent >= 100) return Colors.error;
  if (percent > 75) return Colors.error;
  if (percent >= 50) return Colors.warning;
  return Colors.success;
}

function getStatusLabel(status: TaxStatus['status']): string {
  switch (status) {
    case 'resident': return 'Tax Resident';
    case 'warning': return 'Warning';
    case 'caution': return 'Caution';
    case 'safe': return 'Safe';
  }
}

function getStatusColor(status: TaxStatus['status']): string {
  switch (status) {
    case 'resident': return Colors.error;
    case 'warning': return Colors.error;
    case 'caution': return Colors.warning;
    case 'safe': return Colors.success;
  }
}

function TaxCard({ tax }: { tax: TaxStatus }) {
  const progressColor = getProgressColor(tax.percentUsed);
  const statusColor = getStatusColor(tax.status);
  const progressWidth = Math.min(tax.percentUsed, 100);

  return (
    <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitle}>
          <Text style={styles.flag}>{tax.flag}</Text>
          <View style={styles.titleText}>
            <Text style={styles.destination}>{tax.country}</Text>
            <Text style={styles.ruleLabel}>{tax.ruleLabel}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {getStatusLabel(tax.status)}
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
          <Text style={styles.daysUsed}>{tax.daysPresent}</Text>
          <Text style={styles.daysOf}> of </Text>
          <Text style={styles.daysAllowed}>{tax.thresholdDays}</Text>
          <Text style={styles.daysOf}> days present</Text>
        </Text>
        <Text style={[styles.daysRemaining, { color: progressColor }]}>
          {tax.daysRemaining}d left
        </Text>
      </View>
    </Glass>
  );
}

export default function TaxScreen() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const { taxStatuses, availableYears, loading, citizenshipCode, citizenshipCountry, refresh } =
    useTaxTracker(year);
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
        subtitle="Set your citizenship in Settings to see tax residence tracking."
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
      <YearPicker
        years={availableYears}
        value={year}
        onChange={(v) => setYear(v ?? new Date().getFullYear())}
        includeAllTime={false}
      />

      <Text style={styles.subtitle}>
        Based on {citizenshipFlag} {citizenshipCountry} citizenship · {year}
      </Text>

      {taxStatuses.length === 0 ? (
        <View style={styles.emptyForYear}>
          <Text style={styles.emptyForYearTitle}>No tax exposure in {year}</Text>
          <Text style={styles.emptyForYearSubtitle}>
            You haven&apos;t spent days in any taxable country during this year.
          </Text>
        </View>
      ) : (
        taxStatuses.map((tax) => <TaxCard key={tax.countryCode} tax={tax} />)
      )}

      <Text style={styles.disclaimer}>
        This is not tax advice. Most countries determine residency by calendar year (183-day rule), but some use rolling 12-month or fiscal-year windows. Consult a qualified tax professional.
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
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  ruleLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderCurve: 'continuous',
  },
  statusText: {
    fontSize: 12,
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
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  disclaimer: {
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    lineHeight: 18,
  },
  emptyForYear: {
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 6,
  },
  emptyForYearTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  emptyForYearSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
});
