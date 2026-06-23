import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Linking, Modal, PlatformColor, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { useTaxTracker } from '../../../hooks/useTaxTracker';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { CloudyButton } from '../../../components/CloudyButton';
import { Flag } from '../../../components/Flag';
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
          <Flag code={tax.countryCode} size={24} />
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

const TAX_DISCLAIMER_SEEN_KEY = '@tax_disclaimer_seen';

export default function TaxScreen() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const { taxStatuses, availableYears, loading, citizenshipCode, citizenshipCountry, refresh } =
    useTaxTracker(year);
  const [refreshing, setRefreshing] = useState(false);
  const [showFirstRunDisclaimer, setShowFirstRunDisclaimer] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(TAX_DISCLAIMER_SEEN_KEY).then((seen) => {
      if (!seen) setShowFirstRunDisclaimer(true);
    });
  }, []);

  const dismissFirstRunDisclaimer = useCallback(async () => {
    await AsyncStorage.setItem(TAX_DISCLAIMER_SEEN_KEY, '1');
    setShowFirstRunDisclaimer(false);
  }, []);

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
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.emptyScroll}
      >
        <View style={styles.emptyInner}>
          <SymbolView name="person.text.rectangle" size={48} tintColor={PlatformColor('tertiaryLabel')} weight="regular" />
          <Text style={styles.emptyTitle}>No citizenship set</Text>
          <Text style={styles.emptySubtitle}>Set your citizenship in Settings to see tax residence tracking.</Text>
        </View>
      </ScrollView>
    );
  }

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

      <View style={styles.subtitleRow}>
        <Text style={styles.subtitle}>Based on </Text>
        {citizenshipCode && <Flag code={citizenshipCode} size={14} />}
        <Text style={styles.subtitle}> {citizenshipCountry} citizenship · {year}</Text>
      </View>

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

      <Glass {...glassProps} style={[styles.disclaimerBlock, !hasGlass && styles.disclaimerBlockFallback]}>
        <View style={styles.disclaimerIconWrap}>
          <Ionicons name="information-circle" size={22} color={Colors.cloudyButtonText} />
        </View>
        <Text style={styles.disclaimerTitle}>Reference only, not tax advice</Text>
        <Text style={styles.disclaimer}>
          Nomadu&rsquo;s 183-day rule is a simplification. Many countries use rolling
          12-month windows, fiscal years, CFC rules, treaty tie-breakers, or other
          tests that this app does not model. Always consult a qualified tax advisor
          before making decisions based on these numbers.
        </Text>
        <Pressable
          hitSlop={6}
          onPress={() => Linking.openURL('https://en.wikipedia.org/wiki/Tax_residence')}
          style={styles.disclaimerLinkRow}
        >
          <Text style={styles.disclaimerLink}>Learn about tax residency</Text>
          <Ionicons name="open-outline" size={13} color={Colors.cloudyButtonText} />
        </Pressable>
      </Glass>

      <FirstRunDisclaimerModal
        visible={showFirstRunDisclaimer}
        onDismiss={dismissFirstRunDisclaimer}
      />
    </ScrollView>
  );
}

function FirstRunDisclaimerModal({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onDismiss}
    >
      <View style={styles.modalBackdrop}>
        <Glass
          {...glassProps}
          style={[styles.modalCard, !hasGlass && styles.modalCardFallback]}
        >
          <View style={styles.modalIconWrap}>
            <Ionicons name="information-circle" size={32} color={Colors.cloudyButtonText} />
          </View>
          <Text style={styles.modalTitle}>Before you trust this tab</Text>
          <Text style={styles.modalBody}>
            The Tax tab uses a simplified 183-day rule to flag countries where you
            might be triggering tax residency. Real tax law is far more nuanced:
            rolling windows, fiscal years, treaty tie-breakers, CFC rules, and more.
            {'\n\n'}
            Nomadu is not a tax advisor and is not liable for tax filings, fines, or
            other consequences of relying on this data. Always consult a qualified
            tax professional before acting on what you see here.
          </Text>
          <CloudyButton
            onPress={onDismiss}
            style={styles.modalButton}
            innerStyle={styles.modalButtonInner}
          >
            <Text style={styles.modalButtonText}>I understand</Text>
          </CloudyButton>
        </Glass>
      </View>
    </Modal>
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
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
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
  // Native empty state (no citizenship)
  emptyScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  emptyInner: {
    alignItems: 'center',
    maxWidth: 320,
  },
  emptyTitle: {
    ...Typography.titleLarge,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 16,
  },
  emptySubtitle: {
    ...Typography.body,
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 6,
  },

  // Disclaimer block (Glass, cloud tint)
  disclaimer: {
    ...Typography.caption,
    fontSize: 12.5,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  disclaimerBlock: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 8,
    borderRadius: 20,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: 'rgba(138, 211, 255, 0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(77, 193, 255, 0.35)',
  },
  disclaimerBlockFallback: {
    backgroundColor: 'rgba(219, 240, 255, 0.7)',
  },
  disclaimerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(77, 193, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  disclaimerTitle: {
    ...Typography.titleSmall,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  disclaimerLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(77, 193, 255, 0.18)',
  },
  disclaimerLink: {
    ...Typography.caption,
    fontSize: 12.5,
    color: Colors.cloudyButtonText,
    fontWeight: '700',
  },

  // First-run modal (mirror of visa tab)
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 37, 65, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    borderCurve: 'continuous',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 22,
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  modalCardFallback: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: Colors.border,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(77, 193, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    ...Typography.brandDisplay,
    fontSize: 24,
    textAlign: 'center',
  },
  modalBody: {
    ...Typography.body,
    fontSize: 14.5,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  modalButton: {
    marginTop: 4,
    width: '100%',
  },
  modalButtonInner: {
    justifyContent: 'center',
  },
  modalButtonText: {
    ...Typography.buttonLarge,
    color: Colors.cloudyButtonText,
    textAlign: 'center',
  },

  emptyForYear: {
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 6,
  },
  emptyForYearTitle: {
    ...Typography.button,
  },
  emptyForYearSubtitle: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
});
