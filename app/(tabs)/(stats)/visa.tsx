import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { formatDay } from '../../../lib/days';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useNavigation, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useVisaTracker } from '../../../hooks/useVisaTracker';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { CloudyButton } from '../../../components/CloudyButton';
import { Flag } from '../../../components/Flag';
import { todayStr, visaGroup, VisaStatus } from '../../../lib/visaCalculations';
import { hasNoExpiry } from '../../../lib/userVisas';
import { getCountryName } from '../../../utils/geography';
import { useTranslation } from '../../../contexts/LanguageContext';
import { EmptyState } from '../../../components/EmptyState';

type TFunc = (key: string, params?: Record<string, string | number>) => string;

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

function getProgressColor(percent: number): string {
  if (percent > 85) return Colors.error;
  if (percent > 67) return Colors.warning;
  return Colors.success;
}

/** True when the visa is past its own expiry date, as opposed to used up. */
function isDateExpired(visa: VisaStatus): boolean {
  if (!visa.validUntil || hasNoExpiry(visa.validUntil)) return false;
  return visa.validUntil < todayStr();
}

function getStatusLabel(visa: VisaStatus, t: TFunc): string {
  // A spent single-entry visa is 'expired' too, but "Used" is what happened.
  if (visa.singleEntryUsed && !isDateExpired(visa)) return t('visa.statusUsed');
  switch (visa.status) {
    case 'exceeded': return t('visa.statusExceeded');
    case 'critical': return t('visa.statusCritical');
    case 'warning': return t('visa.statusWarning');
    case 'ok': return t('visa.statusOk');
    case 'visa_needed': return t('visa.statusVisaNeeded');
    case 'expired': return t('visa.statusExpired');
  }
}

function getStatusColor(status: VisaStatus['status']): string {
  switch (status) {
    case 'exceeded': return Colors.error;
    case 'critical': return Colors.error;
    case 'warning': return Colors.warning;
    case 'ok': return Colors.success;
    case 'visa_needed': return Colors.textSecondary;
    case 'expired': return Colors.error;
  }
}

function CardHeader({ visa, interactive }: { visa: VisaStatus; interactive?: boolean }) {
  const { t, countryName } = useTranslation();
  const statusColor = getStatusColor(visa.status);
  return (
    <View style={styles.cardHeader}>
      <View style={styles.cardTitle}>
        <Flag code={visa.destinationCode} size={24} />
        <View style={styles.titleText}>
          <Text style={styles.destination}>{countryName(visa.destination)}</Text>
          <Text style={styles.ruleLabel}>{visa.ruleLabel}</Text>
        </View>
      </View>
      <View style={styles.headerRight}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {getStatusLabel(visa, t)}
          </Text>
        </View>
        {interactive && (
          <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
        )}
      </View>
    </View>
  );
}

function VisaNeededCard({ visa, onPress }: { visa: VisaStatus; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress}>
      <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
        <CardHeader visa={visa} interactive />
        <Text style={styles.visaNeededHint}>
          {t('visa.addToTrack')}
        </Text>
      </Glass>
    </Pressable>
  );
}

function ExpiredVisaCard({ visa, onPress }: { visa: VisaStatus; onPress?: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress}>
      <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
        <CardHeader visa={visa} interactive={!!onPress} />
        <Text style={styles.visaNeededHint}>
          {isDateExpired(visa)
            ? t('visa.expiredOn', { date: formatDay(visa.validUntil) })
            : visa.singleEntryUsed
              ? t('visa.singleEntryUsed', { date: formatDay(visa.leftOn) })
              : t('visa.expiredShort')}
        </Text>
      </Glass>
    </Pressable>
  );
}

function VisaCard({ visa, onPress }: { visa: VisaStatus; onPress?: () => void }) {
  const { t } = useTranslation();
  if (visa.status === 'visa_needed') {
    return <VisaNeededCard visa={visa} onPress={() => onPress?.()} />;
  }
  if (visa.status === 'expired') {
    return <ExpiredVisaCard visa={visa} onPress={onPress} />;
  }

  const progressColor = getProgressColor(visa.percentUsed);
  const progressWidth = Math.min(visa.percentUsed, 100);
  // Per-stay rules stop counting on exit. Showing an empty bar would suggest
  // the allowance is running and unused; naming the exit date is the truth.
  const stayOver = !!visa.leftOn && visa.daysUsed === 0;

  const body = (
    <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
      <CardHeader visa={visa} interactive={!!onPress} />

      {visa.daysAllowed > 0 && stayOver ? (
        <Text style={styles.visaNeededHint}>
          {t('visa.counterReset', { date: formatDay(visa.leftOn) })}
          {visa.lastStayDays ? t('visa.lastStay', { used: visa.lastStayDays, allowed: visa.daysAllowed }) : ''}
        </Text>
      ) : visa.daysAllowed > 0 ? (
        <>
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
              <Text style={styles.daysOf}>{t('visa.ofConnector')}</Text>
              <Text style={styles.daysAllowed}>{visa.daysAllowed}</Text>
              <Text style={styles.daysOf}>{t('visa.daysUsedSuffix')}</Text>
            </Text>
            <Text style={[styles.daysRemaining, { color: progressColor }]}>
              {t('visa.daysLeft', { days: visa.daysRemaining })}
            </Text>
          </View>
        </>
      ) : (
        visa.validUntil && (
          <Text style={styles.visaNeededHint}>
            {hasNoExpiry(visa.validUntil)
              ? t('visa.noExpiry')
              : t('visa.validUntil', { date: formatDay(visa.validUntil) })}
          </Text>
        )
      )}

      {!visa.isUserVisa && <SourceFooter visa={visa} />}
      {!visa.isUserVisa && (
        <Text style={styles.overrideHint}>{t('visa.overrideHint')}</Text>
      )}
    </Glass>
  );

  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

/**
 * Shown on auto-rule cards (not user-visas): "Verified YYYY-MM-DD" + a tappable
 * "Open official source" link. Reduces our liability surface by making it
 * obvious that the data is a reference estimate, not the destination's word.
 */
function SourceFooter({ visa }: { visa: VisaStatus }) {
  const { t } = useTranslation();
  if (!visa.lastVerified && !visa.source) return null;
  return (
    <View style={styles.sourceFooter}>
      {visa.lastVerified && (
        <Text style={styles.sourceText}>{t('visa.verified', { date: formatDay(visa.lastVerified) })}</Text>
      )}
      {visa.source && (
        <Pressable
          hitSlop={6}
          onPress={(e) => {
            e.stopPropagation?.();
            Linking.openURL(visa.source!);
          }}
        >
          <Text style={styles.sourceLink}>{t('visa.openSource')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const groupOf = visaGroup;

function SectionHeader({
  title,
  count,
  collapsed,
  onToggle,
}: {
  title: string;
  count: number;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const body = (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionMeta}>
        <Text style={styles.sectionCount}>{count}</Text>
        {onToggle && (
          <Ionicons
            name={collapsed ? 'chevron-down' : 'chevron-up'}
            size={14}
            color={Colors.textTertiary}
          />
        )}
      </View>
    </>
  );

  if (!onToggle) {
    return <View style={styles.sectionHeader}>{body}</View>;
  }
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      style={({ pressed }) => [styles.sectionHeader, pressed && { opacity: 0.6 }]}
    >
      {body}
    </Pressable>
  );
}

const VISA_DISCLAIMER_SEEN_KEY = '@visa_disclaimer_seen';

export default function VisaScreen() {
  const { t, countryName } = useTranslation();
  const { visaStatuses, loading, citizenshipCode, citizenshipCountry, refresh } = useVisaTracker();
  const [refreshing, setRefreshing] = useState(false);
  const [showFirstRunDisclaimer, setShowFirstRunDisclaimer] = useState(false);
  const [showPastCountries, setShowPastCountries] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(VISA_DISCLAIMER_SEEN_KEY).then((seen) => {
      if (!seen) setShowFirstRunDisclaimer(true);
    });
  }, []);

  const dismissFirstRunDisclaimer = useCallback(async () => {
    await AsyncStorage.setItem(VISA_DISCLAIMER_SEEN_KEY, '1');
    setShowFirstRunDisclaimer(false);
  }, []);
  const router = useRouter();
  const navigation = useNavigation();

  // Adding walks the three-step flow; editing opens the single-screen form.
  const goToAdd = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/(stats)/visa-new/country');
  }, [router]);

  const goToEdit = useCallback((id: number) => {
    Haptics.selectionAsync();
    router.push(`/(tabs)/(stats)/visa-edit?id=${id}`);
  }, [router]);

  // Tapping an auto-rule card already answers step one, so skip straight to it.
  const goToOverride = useCallback((countryCode: string) => {
    Haptics.selectionAsync();
    const name = getCountryName(countryCode) ?? countryCode;
    router.push({
      pathname: '/(tabs)/(stats)/visa-new/stay',
      params: { code: countryCode, name },
    });
  }, [router]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable hitSlop={12} onPress={goToAdd} accessibilityRole="button" accessibilityLabel={t('visa.addVisa')}>
          <Ionicons name="add" size={26} color={Colors.text} />
        </Pressable>
      ),
    });
  }, [navigation, goToAdd, t]);

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
        icons={[{ name: 'earth', color: '#A6B4C2' }, { name: 'person', color: '#4DC1FF' }, { name: 'document-text', color: '#A6B4C2' }]}
        title={t('visa.noCitizenshipTitle')}
        subtitle={t('visa.noCitizenshipSubtitle')}
        primary={{ label: t('visa.setPassport'), onPress: () => router.push('/(tabs)/(settings)/passport') }}
      />
    );
  }

  if (visaStatuses.length === 0) {
    return (
      <EmptyState
        icons={[{ name: 'calendar', color: '#A6B4C2' }, { name: 'document-text', color: '#4DC1FF' }, { name: 'airplane', color: '#A6B4C2' }]}
        title={t('visa.noVisasTitle')}
        subtitle={t('visa.noVisasSubtitle')}
        primary={{ label: t('visa.addVisa'), icon: 'add-circle-outline', onPress: goToAdd }}
      />
    );
  }

  const active = visaStatuses.filter((v) => groupOf(v) === 'active');
  const expiredVisas = visaStatuses.filter((v) => groupOf(v) === 'expiredVisa');
  // Most recently left first: the country you were in last month is the one
  // you are most likely to be looking for.
  const pastCountries = visaStatuses
    .filter((v) => groupOf(v) === 'pastCountry')
    .sort((a, b) => (b.leftOn ?? '').localeCompare(a.leftOn ?? ''));

  const renderCard = (visa: VisaStatus) => (
    <VisaCard
      key={visa.isUserVisa ? `uv-${visa.userVisaId}` : visa.destinationCode}
      visa={visa}
      onPress={visa.isUserVisa && visa.userVisaId
        ? () => goToEdit(visa.userVisaId!)
        : visa.status === 'visa_needed'
          ? goToAdd
          : visa.destinationCode !== 'SCHENGEN'
            ? () => goToOverride(visa.destinationCode)
            : undefined}
    />
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <View style={styles.subtitleRow}>
        <Text style={styles.subtitle}>{t('visa.basedOn')}</Text>
        {citizenshipCode && <Flag code={citizenshipCode} size={14} />}
        <Text style={styles.subtitle}>{t('visa.passportSuffix', { country: countryName(citizenshipCountry) })}</Text>
      </View>

      {active.map(renderCard)}

      {expiredVisas.length > 0 && (
        <>
          <SectionHeader title={t('visa.expiredVisas')} count={expiredVisas.length} />
          {expiredVisas.map(renderCard)}
        </>
      )}

      {pastCountries.length > 0 && (
        <>
          <SectionHeader
            title={t('visa.countriesLeft')}
            count={pastCountries.length}
            collapsed={!showPastCountries}
            onToggle={() => {
              Haptics.selectionAsync();
              setShowPastCountries((v) => !v);
            }}
          />
          {showPastCountries && pastCountries.map(renderCard)}
        </>
      )}

      <Glass {...glassProps} style={[styles.disclaimerBlock, !hasGlass && styles.disclaimerBlockFallback]}>
        <View style={styles.disclaimerIconWrap}>
          <Ionicons name="information-circle" size={22} color={Colors.cloudyButtonText} />
        </View>
        <Text style={styles.disclaimerTitle}>{t('visa.disclaimerTitle')}</Text>
        <Text style={styles.disclaimer}>
          {t('visa.disclaimerBody')}
        </Text>
        <Pressable
          hitSlop={6}
          onPress={() => Linking.openURL('https://www.iatatravelcentre.com/')}
          style={styles.disclaimerLinkRow}
        >
          <Text style={styles.disclaimerLink}>{t('visa.openIata')}</Text>
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
          <Text style={styles.modalTitle}>{t('visa.modalTitle')}</Text>
          <Text style={styles.modalBody}>
            {t('visa.modalBody')}
          </Text>
          <CloudyButton
            onPress={onDismiss}
            style={styles.modalButton}
            innerStyle={styles.modalButtonInner}
          >
            <Text style={styles.modalButtonText}>{t('visa.understand')}</Text>
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingLeft: 4,
    paddingRight: 4,
    marginTop: 18,
    marginBottom: 2,
  },
  sectionTitle: { ...Typography.sectionLabel },
  sectionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sectionCount: {
    ...Typography.bodySmall,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textTertiary,
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  visaNeededHint: {
    ...Typography.bodySmall,
    fontSize: 13.5,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  overrideHint: {
    ...Typography.caption,
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  sourceFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  sourceText: {
    ...Typography.caption,
    fontSize: 11,
    color: Colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  sourceLink: {
    ...Typography.caption,
    fontSize: 11,
    color: Colors.cloudyButtonText,
    fontWeight: '600',
  },
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
