import { useMemo, useState } from 'react';
import { PlatformColor, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Calendar, type DateData } from 'react-native-calendars';
import * as Haptics from 'expo-haptics';
import { insertTripManual, updateTrip, parseDate } from '../../../../lib/database';
import { forwardGeocode } from '../../../../lib/geocoding';
import { getCountryCode } from '../../../../utils/geography';
import { showToast } from '../../../../lib/toast';

type Params = {
  country: string;
  city: string;
  id?: string;
  start?: string;
  end?: string;
  noEnd?: string;
};

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const todayStr = fmt(new Date());

const RANGE_COLOR = '#000000';
const RANGE_BG = 'rgba(0,0,0,0.08)';

export default function CreateDatesScreen() {
  const router = useRouter();
  const parentNav = useNavigation();
  const params = useLocalSearchParams<Params>();
  const { country, city } = params;
  const isEditing = !!params.id;

  const initialStart = params.start ? parseDate(params.start) : new Date();
  const initialEnd = params.end ? parseDate(params.end) : new Date();
  const initialNoEnd = params.noEnd === '1';

  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [noEndDate, setNoEndDate] = useState(initialNoEnd);
  const [pickingEnd, setPickingEnd] = useState(false);
  const [saving, setSaving] = useState(false);

  const days = noEndDate
    ? Math.max(1, Math.round((new Date().getTime() - startDate.getTime()) / 86_400_000) + 1)
    : Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);

  const handleDayPress = (day: DateData) => {
    const d = parseDate(day.dateString);
    Haptics.selectionAsync();

    if (noEndDate) {
      setStartDate(d);
      return;
    }

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

  // Build marked dates for the range
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    const start = fmt(startDate);
    const end = noEndDate ? start : fmt(endDate);

    if (start === end) {
      marks[start] = {
        startingDay: true,
        endingDay: true,
        color: RANGE_COLOR,
        textColor: '#fff',
      };
    } else {
      const cursor = new Date(startDate);
      const endD = new Date(endDate);
      while (cursor <= endD) {
        const key = fmt(cursor);
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
  }, [startDate, endDate, noEndDate]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const code = getCountryCode(country);
      const s = fmt(startDate);
      const e = noEndDate ? null : fmt(endDate);
      const coords = await forwardGeocode(`${city}, ${country}`);
      if (isEditing && params.id) {
        await updateTrip(
          Number(params.id), city, country, code, s, e,
          coords?.latitude, coords?.longitude,
        );
      } else {
        await insertTripManual(city, country, code, s, e, coords?.latitude, coords?.longitude);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      parentNav.getParent()?.goBack();
      showToast(isEditing ? 'Trip updated' : 'Trip added');
    } catch (err) {
      console.error('Failed to save trip:', err);
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: isEditing ? 'Edit Dates' : 'Trip Dates',
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
      >
        {/* Location + days summary */}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLocation}>{city}, {country}</Text>
          <View style={styles.daysBubble}>
            <Text style={styles.daysText}>{days}d</Text>
          </View>
        </View>

        {/* Hint */}
        {!noEndDate && (
          <Text style={styles.hint}>
            {pickingEnd ? 'Tap a date for the end' : 'Tap a date for the start'}
          </Text>
        )}

        {/* Calendar */}
        <Calendar
          maxDate={todayStr}
          onDayPress={handleDayPress}
          markingType="period"
          markedDates={markedDates}
          theme={{
            backgroundColor: 'transparent',
            calendarBackground: 'transparent',
            textSectionTitleColor: '#8E8E93',
            dayTextColor: '#000',
            todayTextColor: '#000',
            todayBackgroundColor: 'rgba(0,0,0,0.06)',
            monthTextColor: '#000',
            textMonthFontWeight: '700',
            textDayFontSize: 16,
            textDayFontWeight: '400',
            textMonthFontSize: 17,
            textDayHeaderFontSize: 13,
            textDisabledColor: '#C7C7CC',
            arrowColor: '#000',
          }}
        />

        {/* Still traveling toggle */}
        <View style={styles.section}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Still traveling</Text>
            <Switch
              value={noEndDate}
              onValueChange={(v) => {
                setNoEndDate(v);
                if (!v) setPickingEnd(false);
              }}
            />
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 12,
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
  hint: {
    fontSize: 13,
    color: PlatformColor('secondaryLabel'),
    textAlign: 'center',
  },
  section: {
    backgroundColor: PlatformColor('secondarySystemGroupedBackground'),
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toggleLabel: {
    fontSize: 16,
    color: PlatformColor('label'),
  },
});
