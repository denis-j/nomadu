import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Linking, Modal, PlatformColor, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { useVisaTracker } from '../../../hooks/useVisaTracker';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { CloudyButton } from '../../../components/CloudyButton';
import { Flag } from '../../../components/Flag';
import { todayStr, VisaStatus } from '../../../lib/visaCalculations';

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
  return !!visa.validUntil && visa.validUntil < todayStr();
}

function getStatusLabel(visa: VisaStatus): string {
  // A spent single-entry visa is 'expired' too, but "Used" is what happened.
  if (visa.singleEntryUsed && !isDateExpired(visa)) return 'Used';
  switch (visa.status) {
    case 'exceeded': return 'Exceeded';
    case 'critical': return 'Critical';
    case 'warning': return 'Warning';
    case 'ok': return 'OK';
    case 'visa_needed': return 'Visa needed';
    case 'expired': return 'Expired';
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
  const statusColor = getStatusColor(visa.status);
  return (
    <View style={styles.cardHeader}>
      <View style={styles.cardTitle}>
        <Flag code={visa.destinationCode} size={24} />
        <View style={styles.titleText}>
          <Text style={styles.destination}>{visa.destination}</Text>
          <Text style={styles.ruleLabel}>{visa.ruleLabel}</Text>
        </View>
      </View>
      <View style={styles.headerRight}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {getStatusLabel(visa)}
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
  return (
    <Pressable onPress={onPress}>
      <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
        <CardHeader visa={visa} interactive />
        <Text style={styles.visaNeededHint}>
          Add your visa to track days used and expiry.
        </Text>
      </Glass>
    </Pressable>
  );
}

function ExpiredVisaCard({ visa, onPress }: { visa: VisaStatus; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
        <CardHeader visa={visa} interactive={!!onPress} />
        <Text style={styles.visaNeededHint}>
          {isDateExpired(visa)
            ? `Expired on ${visa.validUntil}. Update or remove this visa.`
            : visa.singleEntryUsed
              ? `Single entry, used up when you left on ${visa.leftOn}. A new entry needs a new visa.`
              : 'Expired.'}
        </Text>
      </Glass>
    </Pressable>
  );
}

function VisaCard({ visa, onPress }: { visa: VisaStatus; onPress?: () => void }) {
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
          Counter reset when you left on {visa.leftOn}.
          {visa.lastStayDays ? ` Last stay: ${visa.lastStayDays} of ${visa.daysAllowed} days.` : ''}
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
              <Text style={styles.daysOf}> of </Text>
              <Text style={styles.daysAllowed}>{visa.daysAllowed}</Text>
              <Text style={styles.daysOf}> days used</Text>
            </Text>
            <Text style={[styles.daysRemaining, { color: progressColor }]}>
              {visa.daysRemaining}d left
            </Text>
          </View>
        </>
      ) : (
        visa.validUntil && (
          <Text style={styles.visaNeededHint}>Valid until {visa.validUntil}</Text>
        )
      )}

      {!visa.isUserVisa && <SourceFooter visa={visa} />}
      {!visa.isUserVisa && (
        <Text style={styles.overrideHint}>Tap to add your own visa</Text>
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
  if (!visa.lastVerified && !visa.source) return null;
  return (
    <View style={styles.sourceFooter}>
      {visa.lastVerified && (
        <Text style={styles.sourceText}>Verified {visa.lastVerified}</Text>
      )}
      {visa.source && (
        <Pressable
          hitSlop={6}
          onPress={(e) => {
            e.stopPropagation?.();
            Linking.openURL(visa.source!);
          }}
        >
          <Text style={styles.sourceLink}>Open official source ›</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Which of the three groups a card belongs to.
 *
 * The flat, urgency-sorted list put expired visas at the very top and kept a
 * card for every country ever visited, so after a few years of travel the
 * screen was mostly history. Splitting it means the first thing you see is
 * what is actually running.
 */
type Group = 'active' | 'expiredVisa' | 'pastCountry';

function groupOf(visa: VisaStatus): Group {
  if (visa.isUserVisa) {
    return visa.status === 'expired' ? 'expiredVisa' : 'active';
  }
  // An auto rule whose stay is over: you were there, you are not now.
  return visa.leftOn && visa.daysUsed === 0 ? 'pastCountry' : 'active';
}

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

  const goToAdd = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/(stats)/visa-edit');
  }, [router]);

  const goToEdit = useCallback((id: number) => {
    Haptics.selectionAsync();
    router.push(`/(tabs)/(stats)/visa-edit?id=${id}`);
  }, [router]);

  const goToOverride = useCallback((countryCode: string) => {
    Haptics.selectionAsync();
    router.push(`/(tabs)/(stats)/visa-edit?country=${countryCode}`);
  }, [router]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable hitSlop={12} onPress={goToAdd}>
          <Ionicons name="add" size={26} color={Colors.text} />
        </Pressable>
      ),
    });
  }, [navigation, goToAdd]);

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
          <Text style={styles.emptySubtitle}>Set your citizenship in Settings to see visa tracking.</Text>
        </View>
      </ScrollView>
    );
  }

  if (visaStatuses.length === 0) {
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.emptyScroll}
      >
        <View style={styles.emptyInner}>
          <SymbolView name="doc.text" size={48} tintColor={PlatformColor('tertiaryLabel')} weight="regular" />
          <Text style={styles.emptyTitle}>No visas tracked yet</Text>
          <Text style={styles.emptySubtitle}>
            Visit a country with a known rule, or tap + to add your own visa.
          </Text>
        </View>
      </ScrollView>
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
        <Text style={styles.subtitle}>Based on </Text>
        {citizenshipCode && <Flag code={citizenshipCode} size={14} />}
        <Text style={styles.subtitle}> {citizenshipCountry} passport</Text>
      </View>

      {active.map(renderCard)}

      {expiredVisas.length > 0 && (
        <>
          <SectionHeader title="Expired visas" count={expiredVisas.length} />
          {expiredVisas.map(renderCard)}
        </>
      )}

      {pastCountries.length > 0 && (
        <>
          <SectionHeader
            title="Countries you've left"
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
        <Text style={styles.disclaimerTitle}>Reference data, not legal advice</Text>
        <Text style={styles.disclaimer}>
          Visa rules in Nomadu are reference estimates aggregated from public sources
          and may be out of date or incorrect. Always verify with your destination&rsquo;s
          embassy or consulate before you travel.
        </Text>
        <Pressable
          hitSlop={6}
          onPress={() => Linking.openURL('https://www.iatatravelcentre.com/')}
          style={styles.disclaimerLinkRow}
        >
          <Text style={styles.disclaimerLink}>Open IATA Travel Centre</Text>
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
            Visa rules in Nomadu are reference estimates aggregated from public sources.
            They may be out of date, incorrect, or differ from your specific situation.
            {'\n\n'}
            Always verify with your destination&rsquo;s embassy or an official source before
            you travel. Nomadu is not liable for visa overstays, denied entry, or any other
            consequences of relying on this data.
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
  sectionTitle: {
    ...Typography.eyebrow,
    fontSize: 13,
    color: Colors.textSecondary,
  },
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
