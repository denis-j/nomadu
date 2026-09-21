import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PlatformColor,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { deleteJourneyLeg, parseDate, type TransportType } from '../../../lib/database';
import { Flag } from '../../../components/Flag';
import { StatusBadge, planChipText } from '../../../components/accommodationForm';
import { Colors } from '../../../constants/colors';
import { useAccommodation } from '../../../hooks/useAccommodations';
import { setPendingStay } from '../../../lib/accommodationBridge';
import { formatMoney, nightsBetween, primaryOption } from '../../../lib/accommodationModel';
import { getCityTips } from '../../../lib/ai';
import { showToast } from '../../../lib/toast';

type Params = {
  legId: string;
  journeyId: string;
  country: string;
  countryCode: string;
  city: string;
  start: string;
  end: string;
  transport: string;
  notes?: string;
  /** '1' when the start is fixed by the previous stop and only the length is chosen. */
  lockStart?: string;
  /** Sync ids: what the accommodation plan is keyed by. */
  stopSyncId?: string;
  journeySyncId?: string;
  /** '1' on a friend's trip: look, do not touch. */
  readOnly?: string;
};

const TRANSPORT_LABELS: Record<string, { icon: string; label: string }> = {
  flight: { icon: 'airplane', label: 'Flight' },
  train: { icon: 'train-outline', label: 'Train' },
  car: { icon: 'car-outline', label: 'Car' },
  bus: { icon: 'bus-outline', label: 'Bus' },
  ferry: { icon: 'boat-outline', label: 'Ferry' },
  walk: { icon: 'walk-outline', label: 'Walk' },
};

const fmtDisplay = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

// ─── Markdown renderer ───────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2]) {
      parts.push(<Text key={key++} style={{ fontWeight: '700' }}>{match[2]}</Text>);
    } else if (match[3]) {
      parts.push(<Text key={key++} style={{ fontStyle: 'italic' }}>{match[3]}</Text>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MarkdownTips({ text }: { text: string }) {
  const elements = useMemo(() => {
    const lines = text.split('\n');
    const result: React.ReactNode[] = [];
    let key = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('### ')) {
        result.push(<Text key={key++} style={mdStyles.h3}>{renderInline(trimmed.slice(4))}</Text>);
      } else if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
        const slice = trimmed.startsWith('## ') ? 3 : 2;
        result.push(<Text key={key++} style={mdStyles.h2}>{renderInline(trimmed.slice(slice))}</Text>);
      } else if (/^[-*•]\s/.test(trimmed)) {
        result.push(
          <View key={key++} style={mdStyles.bulletRow}>
            <Text style={mdStyles.bullet}>•</Text>
            <Text style={mdStyles.bodyText}>{renderInline(trimmed.slice(2))}</Text>
          </View>
        );
      } else if (/^\d+\.\s/.test(trimmed)) {
        const num = trimmed.match(/^(\d+)\.\s/)![1];
        const content = trimmed.replace(/^\d+\.\s/, '');
        result.push(
          <View key={key++} style={mdStyles.bulletRow}>
            <Text style={mdStyles.num}>{num}.</Text>
            <Text style={mdStyles.bodyText}>{renderInline(content)}</Text>
          </View>
        );
      } else {
        result.push(<Text key={key++} style={mdStyles.bodyText}>{renderInline(trimmed)}</Text>);
      }
    }
    return result;
  }, [text]);
  return <View style={mdStyles.container}>{elements}</View>;
}

const mdStyles = StyleSheet.create({
  container: { gap: 10 },
  h2: { fontSize: 15, fontWeight: '700', color: PlatformColor('label'), marginTop: 4 },
  h3: { fontSize: 14, fontWeight: '600', color: PlatformColor('label'), marginTop: 2 },
  bodyText: { fontSize: 14, lineHeight: 20, color: PlatformColor('label'), flex: 1 },
  bulletRow: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
  bullet: { fontSize: 14, lineHeight: 20, color: PlatformColor('tertiaryLabel') },
  num: { fontSize: 14, lineHeight: 20, color: PlatformColor('tertiaryLabel'), fontVariant: ['tabular-nums'], width: 18 },
});

/** The second line of the stay card: nights, the pick, what it costs. */
function staySummary(plan: NonNullable<ReturnType<typeof useAccommodation>['plan']>): string {
  const nights = nightsBetween(plan.check_in, plan.check_out);
  const parts = [`${nights} ${nights === 1 ? 'night' : 'nights'}`];
  const primary = primaryOption(plan);
  const price = plan.booking ? formatMoney(plan.booking.price, plan.booking.currency) : primary ? formatMoney(primary.total_price, primary.currency) : null;
  if (price) parts.push(price);
  else if (plan.requirements.budget_per_night && plan.requirements.currency) parts.push(`up to ${formatMoney(plan.requirements.budget_per_night, plan.requirements.currency)}/night`);
  if (!primary && plan.options.length) parts.push(`${plan.options.length} to compare`);
  return parts.join(' · ');
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function StopInfoScreen() {
  const router = useRouter();
  const nav = useNavigation();
  const params = useLocalSearchParams<Params>();
  const { city, country, countryCode } = params;

  const startDate = parseDate(params.start);
  const endDate = parseDate(params.end);
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
  const transportInfo = TRANSPORT_LABELS[params.transport] || TRANSPORT_LABELS.flight;

  const [tips, setTips] = useState<string | null>(null);
  const [tipsLoading, setTipsLoading] = useState(false);
  const { plan: stay } = useAccommodation(params.stopSyncId);
  const readOnly = params.readOnly === '1';

  useEffect(() => {
    if (!city || !country) return;
    setTipsLoading(true);
    getCityTips(city, country)
      .then((t) => setTips(t))
      .catch(() => setTips(null))
      .finally(() => setTipsLoading(false));
  }, [city, country]);

  const handleEdit = () => {
    // Swap this sheet for the editor in one navigation update. A first version
    // dismissed and then pushed after a timer; when the dismissal was still
    // running, the editor was presented on top of it and react-native-screens
    // asserted ("modally presented controllers are being reshuffled").
    router.replace({
      pathname: '/(tabs)/(plans)/edit-stop',
      params: {
        legId: params.legId,
        journeyId: params.journeyId,
        country,
        city,
        start: params.start,
        end: params.end,
        transport: params.transport,
        ...(params.notes && { notes: params.notes }),
        ...(params.lockStart && { lockStart: params.lockStart }),
      },
    });
  };

  const openAccommodation = () => {
    if (!params.stopSyncId || !params.journeySyncId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Not a replace: the journey screen pushes the page once this sheet is
    // gone (see accommodationBridge for why).
    setPendingStay({
      stopSyncId: params.stopSyncId,
      journeySyncId: params.journeySyncId,
      city,
      country,
      countryCode,
      start: params.start,
      end: params.end,
      readOnly,
    });
    nav.goBack();
  };

  const handleDelete = () => {
    Alert.alert('Delete Stop', `Remove ${city} from this journey?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteJourneyLeg(Number(params.legId));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          nav.goBack();
          showToast('Stop removed');
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: city }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <Flag code={countryCode} size={36} />
          <View style={styles.headerInfo}>
            <Text style={styles.city}>{city}</Text>
            <Text style={styles.country}>{country}</Text>
          </View>
          <View style={styles.daysBubble}>
            <Text style={styles.daysText}>{days}d</Text>
          </View>
        </View>

        {/* Dates & Transport */}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>From</Text>
            <Text selectable style={styles.rowValue}>{fmtDisplay(startDate)}</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>To</Text>
            <Text selectable style={styles.rowValue}>{fmtDisplay(endDate)}</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Transport</Text>
            <View style={styles.transportChip}>
              <Ionicons name={transportInfo.icon as any} size={14} color={PlatformColor('label') as any} />
              <Text style={styles.rowValue}>{transportInfo.label}</Text>
            </View>
          </View>
        </View>

        {/* Where to stay. On a friend's trip only once they planned something. */}
        {params.stopSyncId && params.journeySyncId && (!readOnly || stay) ? (
          <>
            <Text style={styles.sectionTitle}>Where to stay</Text>
            <Pressable onPress={openAccommodation} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
              <View style={styles.stayRow}>
                <View style={styles.stayIcon}>
                  <Ionicons name="bed-outline" size={20} color={PlatformColor('label') as any} />
                </View>
                <View style={styles.stayText}>
                  {stay ? (
                    <>
                      <Text style={styles.stayTitle} numberOfLines={1}>{planChipText(stay)}</Text>
                      <Text style={styles.staySub} numberOfLines={1}>{staySummary(stay)}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.stayTitle}>Plan a place to stay</Text>
                      <Text style={styles.staySub}>Requirements, options, the booking</Text>
                    </>
                  )}
                </View>
                {stay ? <StatusBadge status={stay.status} size="small" /> : null}
                <Ionicons name="chevron-forward" size={16} color={PlatformColor('tertiaryLabel') as any} />
              </View>
            </Pressable>
          </>
        ) : null}

        {/* Notes */}
        {params.notes ? (
          <>
            <Text style={styles.sectionTitle}>Notes</Text>
            <View style={styles.card}>
              <Text selectable style={styles.notesText}>{params.notes}</Text>
            </View>
          </>
        ) : null}

        {/* Actions: above the tips, which can run long */}
        {!readOnly && (
        <View style={styles.actions}>
          <Pressable style={styles.editButton} onPress={handleEdit}>
            <Ionicons name="pencil" size={16} color={PlatformColor('label') as any} />
            <Text style={styles.editButtonText}>Edit Stop</Text>
          </Pressable>
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={16} color={Colors.error} />
            <Text style={styles.deleteButtonText}>Delete</Text>
          </Pressable>
        </View>
        )}

        {/* Tips */}
        <Text style={styles.sectionTitle}>Tips for {city}</Text>
        <View style={styles.card}>
          {tipsLoading && (
            <View style={styles.tipsCentered}>
              <ActivityIndicator />
              <Text style={styles.tipsLoadingText}>Getting tips…</Text>
            </View>
          )}
          {!tipsLoading && tips && (
            <View style={{ padding: 16 }}>
              <MarkdownTips text={tips} />
            </View>
          )}
          {!tipsLoading && !tips && (
            <Text style={styles.tipsEmpty}>No tips available</Text>
          )}
        </View>

      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 4,
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  city: {
    fontSize: 20,
    fontWeight: '700',
    color: PlatformColor('label'),
  },
  country: {
    fontSize: 15,
    color: PlatformColor('secondaryLabel'),
  },
  daysBubble: {
    backgroundColor: PlatformColor('systemGray5'),
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  daysText: {
    fontSize: 15,
    fontWeight: '700',
    color: PlatformColor('label'),
    fontVariant: ['tabular-nums'],
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: PlatformColor('secondaryLabel'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: PlatformColor('secondarySystemGroupedBackground'),
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowLabel: {
    fontSize: 16,
    color: PlatformColor('label'),
  },
  rowValue: {
    fontSize: 16,
    color: PlatformColor('secondaryLabel'),
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: PlatformColor('separator'),
    marginLeft: 16,
  },
  transportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  stayIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: PlatformColor('systemGray5'),
    alignItems: 'center',
    justifyContent: 'center',
  },
  stayText: { flex: 1, gap: 2 },
  stayTitle: { fontSize: 16, fontWeight: '600', color: PlatformColor('label') },
  staySub: { fontSize: 13, color: PlatformColor('secondaryLabel') },
  notesText: {
    padding: 16,
    fontSize: 15,
    lineHeight: 22,
    color: PlatformColor('label'),
  },
  tipsCentered: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  tipsLoadingText: {
    fontSize: 13,
    color: PlatformColor('secondaryLabel'),
  },
  tipsEmpty: {
    padding: 16,
    fontSize: 15,
    color: PlatformColor('tertiaryLabel'),
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: PlatformColor('secondarySystemGroupedBackground'),
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: PlatformColor('label'),
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: '#EF535010',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.error,
  },
});
