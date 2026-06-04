import { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, PlatformColor, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { useVisaTracker } from '../../../hooks/useVisaTracker';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { Flag } from '../../../components/Flag';
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
            {getStatusLabel(visa.status)}
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
          {visa.validUntil ? `Expired on ${visa.validUntil}. Update or remove this visa.` : 'Expired.'}
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

  const body = (
    <Glass {...glassProps} style={[styles.card, !hasGlass && styles.cardFallback]}>
      <CardHeader visa={visa} interactive={!!onPress} />

      {visa.daysAllowed > 0 ? (
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

      {!visa.isUserVisa && (
        <Text style={styles.overrideHint}>Tap to add your own visa</Text>
      )}
    </Glass>
  );

  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

export default function VisaScreen() {
  const { visaStatuses, loading, citizenshipCode, citizenshipCountry, refresh } = useVisaTracker();
  const [refreshing, setRefreshing] = useState(false);
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

      {visaStatuses.map((visa) => (
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
  disclaimer: {
    ...Typography.caption,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    lineHeight: 18,
  },
});
