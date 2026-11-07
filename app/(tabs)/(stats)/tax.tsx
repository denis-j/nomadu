import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useTaxTracker } from '../../../hooks/useTaxTracker';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { CloudyButton } from '../../../components/CloudyButton';
import { DaysMeter, Footnote, PassportLine, TrackerCard } from '../../../components/TrackerParts';
import { fromYmd } from '../../../lib/days';
import { YearPicker } from '../../../components/YearPicker';
import { TaxStatus } from '../../../lib/taxCalculations';
import { useTranslation } from '../../../contexts/LanguageContext';
import { EmptyState } from '../../../components/EmptyState';

type TFunc = (key: string, params?: Record<string, string | number>) => string;

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

function getProgressColor(percent: number): string {
  if (percent > 75) return Colors.error;
  if (percent >= 50) return Colors.warning;
  return Colors.success;
}

function getStatusLabel(status: TaxStatus['status'], t: TFunc): string {
  switch (status) {
    case 'resident': return t('tax.statusResident');
    case 'warning': return t('tax.statusWarning');
    case 'caution': return t('tax.statusCaution');
    case 'safe': return t('tax.statusSafe');
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

/** "Apr 6" or "6. Apr.": a day of a tax year, in the app's language. */
function monthDay(ymd: string, language: string): string {
  return fromYmd(ymd).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { month: 'short', day: 'numeric' });
}

/**
 * What the days are counted over, in the app's language. The status carries
 * an English label for the server; the stretch itself is rebuilt from its
 * dates here.
 */
function periodText(tax: TaxStatus, t: TFunc, language: string): string {
  if (tax.periodKind === 'year') {
    const calendar = tax.periodStart.endsWith('-01-01') && tax.periodEnd.endsWith('-12-31');
    return calendar
      ? t('tax.ruleYear', { year: tax.periodStart.slice(0, 4) })
      : t('tax.ruleTaxYear', { from: monthDay(tax.periodStart, language), to: monthDay(tax.periodEnd, language) });
  }
  const span = (fromYmd(tax.periodEnd).getTime() - fromYmd(tax.periodStart).getTime()) / 86_400_000 + 1;
  return t('tax.ruleMonths', { months: Math.round(span / 30.4) });
}

function TaxCard({ tax }: { tax: TaxStatus }) {
  const { t, countryName, language } = useTranslation();
  return (
    <TrackerCard
      code={tax.countryCode}
      name={countryName(tax.country)}
      status={{ label: getStatusLabel(tax.status, t), color: getStatusColor(tax.status) }}
    >
      <DaysMeter
        used={tax.daysPresent}
        allowed={tax.thresholdDays}
        detail={periodText(tax, t, language)}
        color={getProgressColor(tax.percentUsed)}
      />
    </TrackerCard>
  );
}

const TAX_DISCLAIMER_SEEN_KEY = '@tax_disclaimer_seen';

export default function TaxScreen() {
  const { t, countryName } = useTranslation();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const { taxStatuses, availableYears, loading, citizenshipCode, citizenshipCountry, refresh } =
    useTaxTracker(year);
  const [refreshing, setRefreshing] = useState(false);
  const [showFirstRunDisclaimer, setShowFirstRunDisclaimer] = useState(false);
  const focused = useIsFocused();

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
      <EmptyState
        icons={[{ name: 'earth', color: '#A6B4C2' }, { name: 'person', color: '#4DC1FF' }, { name: 'cash', color: '#A6B4C2' }]}
        title={t('tax.noCitizenshipTitle')}
        subtitle={t('tax.noCitizenshipSubtitle')}
        primary={{ label: t('tax.setPassport'), onPress: () => router.push('/(tabs)/(stats)/passport') }}
      />
    );
  }

  if (taxStatuses.length === 0) {
    return (
      <View style={styles.emptyPage}>
        <View style={styles.emptyPicker}>
          <YearPicker
            years={availableYears}
            value={year}
            onChange={(v) => setYear(v ?? new Date().getFullYear())}
            includeAllTime={false}
          />
        </View>
        <EmptyState
        icons={[{ name: 'calendar', color: '#A6B4C2' }, { name: 'cash', color: '#4DC1FF' }, { name: 'earth', color: '#A6B4C2' }]}
        title={t('tax.noExposureTitle', { year })}
        subtitle={t('tax.noExposureSubtitle')}
        />
      </View>
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

      <PassportLine
        code={citizenshipCode}
        country={countryName(citizenshipCountry)}
        onPress={() => router.push('/(tabs)/(stats)/passport')}
      />

      {taxStatuses.map((tax) => <TaxCard key={tax.countryCode} tax={tax} />)}

      <Footnote text={t('tax.footnote')} link={t('tax.learnMore')} url="https://en.wikipedia.org/wiki/Tax_residence" />

      <FirstRunDisclaimerModal
        // Only while this screen is in front: a React Native modal renders
        // above the whole app, so leaving the tab with it open left it
        // hanging over the timeline and the plans.
        visible={showFirstRunDisclaimer && focused}
        onDismiss={dismissFirstRunDisclaimer}
      />
    </ScrollView>
  );
}

function FirstRunDisclaimerModal({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const { t } = useTranslation();
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
          <Text style={styles.modalTitle}>{t('tax.modalTitle')}</Text>
          <Text style={styles.modalBody}>
            {t('tax.modalBody')}
          </Text>
          <CloudyButton
            onPress={onDismiss}
            style={styles.modalButton}
            innerStyle={styles.modalButtonInner}
          >
            <Text style={styles.modalButtonText}>{t('tax.understand')}</Text>
          </CloudyButton>
        </Glass>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 120,
  },
  emptyPage: { flex: 1 },
  emptyPicker: { padding: 16, paddingBottom: 0 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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

});
