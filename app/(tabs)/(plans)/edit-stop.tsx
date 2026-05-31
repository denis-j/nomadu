import { useCallback, useMemo, useState } from 'react';
import {
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
import { Calendar, type DateData } from 'react-native-calendars';
import * as Haptics from 'expo-haptics';
import { updateJourneyLeg, parseDate, type TransportType } from '../../../lib/database';
import { forwardGeocode } from '../../../lib/geocoding';
import { Colors } from '../../../constants/colors';
import { getCountryCode } from '../../../utils/geography';
import { showToast } from '../../../lib/toast';

type Params = {
  legId: string;
  journeyId: string;
  country: string;
  city: string;
  start: string;
  end: string;
  transport: string;
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

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const RANGE_COLOR = '#000000';
const RANGE_BG = 'rgba(0,0,0,0.08)';

export default function EditStopScreen() {
  const nav = useNavigation();
  const params = useLocalSearchParams<Params>();

  const initialStart = parseDate(params.start);
  const initialEnd = parseDate(params.end);

  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [pickingEnd, setPickingEnd] = useState(false);
  const [transport, setTransport] = useState<TransportType>((params.transport as TransportType) || 'flight');
  const [notes, setNotes] = useState(params.notes || '');
  const [saving, setSaving] = useState(false);

  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);

  // ─── Calendar ───────────────────────────────────────────────────────────────

  const handleDayPress = (day: DateData) => {
    const d = parseDate(day.dateString);
    Haptics.selectionAsync();
    if (!pickingEnd) {
      setStartDate(d);
      setEndDate(d);
      setPickingEnd(true);
    } else {
      if (d < startDate) {
        setEndDate(startDate);
        setStartDate(d);
      } else {
        setEndDate(d);
      }
      setPickingEnd(false);
    }
  };

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    const start = fmtDate(startDate);
    const end = fmtDate(endDate);
    if (start === end) {
      marks[start] = { startingDay: true, endingDay: true, color: RANGE_COLOR, textColor: '#fff' };
    } else {
      const cursor = new Date(startDate);
      const endD = new Date(endDate);
      while (cursor <= endD) {
        const key = fmtDate(cursor);
        const isStart = key === start;
        const isEnd = key === end;
        marks[key] = {
          startingDay: isStart,
          endingDay: isEnd,
          color: isStart || isEnd ? RANGE_COLOR : RANGE_BG,
          textColor: isStart || isEnd ? '#fff' : '#000',
        };
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return marks;
  }, [startDate, endDate]);

  // ─── Save ───────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const code = getCountryCode(params.country);
      const coords = await forwardGeocode(`${params.city}, ${params.country}`);
      await updateJourneyLeg(
        Number(params.legId),
        params.city,
        params.country,
        code,
        fmtDate(startDate),
        fmtDate(endDate),
        transport,
        notes.trim() || null,
        coords?.latitude,
        coords?.longitude,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      nav.goBack();
      showToast('Stop updated');
    } catch (err) {
      console.error('Failed to update leg:', err);
      setSaving(false);
    }
  }, [params, startDate, endDate, transport, notes, nav]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Edit Stop',
          headerRight: () => (
            <Pressable onPress={handleSave} disabled={saving} hitSlop={8} style={{ opacity: saving ? 0.4 : 1 }}>
              <SymbolView name="checkmark" tintColor={PlatformColor('label')} weight="semibold" size={22} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Location summary */}
        <View style={styles.locationRow}>
          <Text style={styles.locationText}>{params.city}, {params.country}</Text>
          <View style={styles.daysBubble}>
            <Text style={styles.daysText}>{days}d</Text>
          </View>
        </View>

        {/* Calendar */}
        <Text style={styles.sectionTitle}>Dates</Text>
        <Text style={styles.hint}>{pickingEnd ? 'Tap end date' : 'Tap start date'}</Text>
        <View style={styles.calendarCard}>
          <Calendar
            markingType="period"
            markedDates={markedDates}
            onDayPress={handleDayPress}
            theme={{
              todayTextColor: '#000',
              arrowColor: '#000',
              textDayFontSize: 15,
              textMonthFontSize: 16,
              textMonthFontWeight: '600',
              textDayHeaderFontSize: 12,
              textDayHeaderFontWeight: '600',
            }}
          />
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
        <View style={styles.inputCard}>
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
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  locationText: {
    fontSize: 17,
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
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: PlatformColor('secondaryLabel'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hint: {
    fontSize: 13,
    color: PlatformColor('tertiaryLabel'),
    marginTop: -8,
  },
  calendarCard: {
    backgroundColor: PlatformColor('secondarySystemGroupedBackground'),
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: 4,
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
    color: Colors.white,
  },
  inputCard: {
    backgroundColor: PlatformColor('secondarySystemGroupedBackground'),
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  notesInput: {
    padding: 16,
    fontSize: 16,
    color: PlatformColor('label'),
    minHeight: 80,
  },
});
