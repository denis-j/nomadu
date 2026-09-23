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
import { Calendar, type DateData } from 'react-native-calendars';
import * as Haptics from 'expo-haptics';
import { MissingRoute } from '../../../components/MissingRoute';
import { StopSummary } from '../../../components/StopSummary';
import { TransportPicker } from '../../../components/TransportPicker';
import { updateJourneyLeg, parseDate, type TransportType } from '../../../lib/database';
import { forwardGeocode } from '../../../lib/geocoding';
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
  /** '1' when the start is fixed by the previous stop and only the length is chosen. */
  lockStart?: string;
};

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const RANGE_COLOR = '#000000';
const RANGE_BG = 'rgba(0,0,0,0.08)';

export default function EditStopScreen() {
  const nav = useNavigation();
  const params = useLocalSearchParams<Params>();
  const complete = !!params.start && !!params.end && !!params.legId;

  const today = fmtDate(new Date());
  const initialStart = parseDate(params.start ?? today);
  const initialEnd = parseDate(params.end ?? today);

  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [pickingEnd, setPickingEnd] = useState(false);
  const [transport, setTransport] = useState<TransportType>((params.transport as TransportType) || 'flight');
  const [notes, setNotes] = useState(params.notes || '');
  const [saving, setSaving] = useState(false);


  // ─── Calendar ───────────────────────────────────────────────────────────────

  // Stops chain: every stop after the first starts the day after the
  // previous one ends, so here only the last day is up for choosing.
  const lockStart = params.lockStart === '1';

  const handleDayPress = (day: DateData) => {
    const d = parseDate(day.dateString);
    if (lockStart) {
      if (d < startDate) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      Haptics.selectionAsync();
      setEndDate(d);
      return;
    }
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

  if (!complete) return <MissingRoute title="Edit Stop" message="This stop is no longer here." />;

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
        <StopSummary city={params.city} country={params.country} start={startDate} end={endDate} />

        {/* Calendar */}
        <Text style={styles.sectionTitle}>Dates</Text>
        <Text style={styles.hint}>
          {lockStart
            ? 'Start is set by the previous stop. Tap the last day.'
            : pickingEnd ? 'Tap end date' : 'Tap start date'}
        </Text>
        <View style={styles.calendarCard}>
          <Calendar
            current={fmtDate(startDate)}
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
        <TransportPicker value={transport} onChange={setTransport} />

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
