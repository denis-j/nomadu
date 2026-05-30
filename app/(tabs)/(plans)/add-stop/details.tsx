import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  PlatformColor,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { insertJourneyLeg, updateJourneyLeg, parseDate, type TransportType } from '../../../../lib/database';
import { forwardGeocode } from '../../../../lib/geocoding';
import { getCountryCode } from '../../../../utils/geography';
import { getCityTips } from '../../../../lib/ai';
import { showToast } from '../../../../lib/toast';

type Params = {
  journeyId: string;
  country: string;
  city: string;
  start: string;
  end: string;
  legId?: string;
  transport?: string;
  notes?: string;
};

const TRANSPORTS: { type: TransportType; icon: string; label: string }[] = [
  { type: 'flight', icon: 'airplane', label: 'Flight' },
  { type: 'train', icon: 'train-outline', label: 'Train' },
  { type: 'car', icon: 'car-outline', label: 'Car' },
  { type: 'bus', icon: 'bus-outline', label: 'Bus' },
  { type: 'ferry', icon: 'boat-outline', label: 'Ferry' },
  { type: 'walk', icon: 'walk-outline', label: 'Walk' },
];

const fmtDisplay = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// ─── Simple Markdown renderer ────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  // Handle **bold** and *italic*
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

      // Headers: ### or ##
      if (trimmed.startsWith('### ')) {
        result.push(
          <Text key={key++} style={mdStyles.h3}>{renderInline(trimmed.slice(4))}</Text>
        );
      } else if (trimmed.startsWith('## ')) {
        result.push(
          <Text key={key++} style={mdStyles.h2}>{renderInline(trimmed.slice(3))}</Text>
        );
      } else if (trimmed.startsWith('# ')) {
        result.push(
          <Text key={key++} style={mdStyles.h2}>{renderInline(trimmed.slice(2))}</Text>
        );
      }
      // Bullet points: - or *
      else if (/^[-*•]\s/.test(trimmed)) {
        result.push(
          <View key={key++} style={mdStyles.bulletRow}>
            <Text style={mdStyles.bullet}>•</Text>
            <Text style={mdStyles.bodyText}>{renderInline(trimmed.slice(2))}</Text>
          </View>
        );
      }
      // Numbered list: 1. 2. etc
      else if (/^\d+\.\s/.test(trimmed)) {
        const num = trimmed.match(/^(\d+)\.\s/)![1];
        const content = trimmed.replace(/^\d+\.\s/, '');
        result.push(
          <View key={key++} style={mdStyles.bulletRow}>
            <Text style={mdStyles.num}>{num}.</Text>
            <Text style={mdStyles.bodyText}>{renderInline(content)}</Text>
          </View>
        );
      }
      // Regular paragraph
      else {
        result.push(
          <Text key={key++} style={mdStyles.bodyText}>{renderInline(trimmed)}</Text>
        );
      }
    }
    return result;
  }, [text]);

  return <View style={mdStyles.container}>{elements}</View>;
}

const mdStyles = StyleSheet.create({
  container: { gap: 10 },
  h2: {
    fontSize: 15,
    fontWeight: '700',
    color: PlatformColor('label'),
    marginTop: 4,
  },
  h3: {
    fontSize: 14,
    fontWeight: '600',
    color: PlatformColor('label'),
    marginTop: 2,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
    color: PlatformColor('label'),
    flex: 1,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 4,
  },
  bullet: {
    fontSize: 14,
    lineHeight: 20,
    color: PlatformColor('tertiaryLabel'),
  },
  num: {
    fontSize: 14,
    lineHeight: 20,
    color: PlatformColor('tertiaryLabel'),
    fontVariant: ['tabular-nums'],
    width: 18,
  },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AddStopDetailsScreen() {
  const parentNav = useNavigation();
  const params = useLocalSearchParams<Params>();
  const { country, city } = params;
  const isEditing = !!params.legId;

  const startDate = parseDate(params.start);
  const endDate = parseDate(params.end);
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);

  const [transport, setTransport] = useState<TransportType>((params.transport as TransportType) || 'flight');
  const [notes, setNotes] = useState(params.notes || '');
  const [saving, setSaving] = useState(false);
  const [tips, setTips] = useState<string | null>(null);
  const [tipsLoading, setTipsLoading] = useState(false);

  useEffect(() => {
    if (!city || !country) return;
    setTipsLoading(true);
    getCityTips(city, country)
      .then((t) => setTips(t))
      .catch(() => setTips(null))
      .finally(() => setTipsLoading(false));
  }, [city, country]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const code = getCountryCode(country);
      const coords = await forwardGeocode(`${city}, ${country}`);
      const notesVal = notes.trim() || null;
      if (isEditing && params.legId) {
        await updateJourneyLeg(
          Number(params.legId),
          city,
          country,
          code,
          params.start,
          params.end,
          transport,
          notesVal,
          coords?.latitude,
          coords?.longitude,
        );
      } else {
        await insertJourneyLeg(
          Number(params.journeyId),
          city,
          country,
          code,
          params.start,
          params.end,
          transport,
          notesVal,
          coords?.latitude,
          coords?.longitude,
        );
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      parentNav.getParent()?.goBack();
      showToast(isEditing ? 'Stop updated' : 'Stop added');
    } catch (err) {
      console.error('Failed to save leg:', err);
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: isEditing ? 'Edit Stop' : 'Stop Details',
          headerRight: () => (
            <Pressable onPress={handleSave} disabled={saving} hitSlop={8} style={{ opacity: saving ? 0.4 : 1 }}>
              <SymbolView
                name="checkmark"
                tintColor={PlatformColor('label')}
                weight="semibold"
                size={22}
              />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Summary */}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLocation}>{city}, {country}</Text>
          <View style={styles.daysBubble}>
            <Text style={styles.daysText}>{days}d</Text>
          </View>
        </View>

        {/* Date range */}
        <View style={styles.section}>
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>From</Text>
            <Text style={styles.dateValue}>{fmtDisplay(startDate)}</Text>
          </View>
          <View style={styles.dateSeparator} />
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>To</Text>
            <Text style={styles.dateValue}>{fmtDisplay(endDate)}</Text>
          </View>
        </View>

        {/* Transport */}
        <Text style={styles.sectionTitle}>Transport</Text>
        <View style={styles.transportGrid}>
          {TRANSPORTS.map((t) => {
            const active = transport === t.type;
            return (
              <Pressable
                key={t.type}
                style={[styles.transportPill, active && styles.transportPillActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setTransport(t.type);
                }}
              >
                <Ionicons
                  name={t.icon as any}
                  size={18}
                  color={active ? '#fff' : PlatformColor('label') as any}
                />
                <Text style={[styles.transportLabel, active && styles.transportLabelActive]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Notes */}
        <Text style={styles.sectionTitle}>Notes</Text>
        <View style={styles.section}>
          <TextInput
            style={styles.notesInput}
            placeholder="Add notes about this stop…"
            placeholderTextColor={PlatformColor('tertiaryLabel') as any}
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* City tips */}
        <Text style={styles.sectionTitle}>Tips</Text>
        <View style={styles.section}>
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLocation: {
    fontSize: 16,
    fontWeight: '600',
    color: PlatformColor('label'),
    flex: 1,
  },
  daysBubble: {
    backgroundColor: PlatformColor('systemGray5'),
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  daysText: {
    fontSize: 14,
    fontWeight: '700',
    color: PlatformColor('label'),
    fontVariant: ['tabular-nums'],
  },
  section: {
    backgroundColor: PlatformColor('secondarySystemGroupedBackground'),
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: PlatformColor('secondaryLabel'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dateLabel: {
    fontSize: 16,
    color: PlatformColor('label'),
  },
  dateValue: {
    fontSize: 16,
    color: PlatformColor('secondaryLabel'),
  },
  dateSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: PlatformColor('separator'),
    marginLeft: 16,
  },
  transportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  transportPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: PlatformColor('secondarySystemGroupedBackground'),
  },
  transportPillActive: {
    backgroundColor: '#000',
  },
  transportLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: PlatformColor('label'),
  },
  transportLabelActive: {
    color: '#fff',
  },
  notesInput: {
    padding: 16,
    fontSize: 16,
    color: PlatformColor('label'),
    minHeight: 80,
  },
  tipsCentered: {
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  tipsLoadingText: {
    fontSize: 13,
    color: PlatformColor('secondaryLabel'),
  },
  tipsText: {
    padding: 16,
    fontSize: 15,
    lineHeight: 22,
    color: PlatformColor('label'),
  },
  tipsEmpty: {
    padding: 16,
    fontSize: 15,
    color: PlatformColor('tertiaryLabel'),
    textAlign: 'center',
  },
});
