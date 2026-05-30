import { useMemo, useState } from 'react';
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Calendar, type DateData } from 'react-native-calendars';
import * as Haptics from 'expo-haptics';
import { parseDate } from '../../../../lib/database';

type Params = {
  journeyId: string;
  country: string;
  city: string;
  legId?: string;
  start?: string;
  end?: string;
  transport?: string;
  notes?: string;
};

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fmtDisplay = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const RANGE_COLOR = '#000000';
const RANGE_BG = 'rgba(0,0,0,0.08)';

export default function AddStopDatesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const { country, city } = params;
  const isEditing = !!params.legId;

  const today = new Date();
  const defaultEnd = new Date();
  defaultEnd.setDate(defaultEnd.getDate() + 7);

  const initialStart = params.start ? parseDate(params.start) : today;
  const initialEnd = params.end ? parseDate(params.end) : defaultEnd;

  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [pickingEnd, setPickingEnd] = useState(false);

  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);

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
    const start = fmt(startDate);
    const end = fmt(endDate);

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
  }, [startDate, endDate]);

  const handleNext = () => {
    router.push({
      pathname: './details',
      params: {
        journeyId: params.journeyId,
        country: params.country,
        city: params.city,
        start: fmt(startDate),
        end: fmt(endDate),
        ...(params.legId && { legId: params.legId }),
        ...(params.transport && { transport: params.transport }),
        ...(params.notes && { notes: params.notes }),
      },
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: isEditing ? 'Edit Dates' : 'Trip Dates',
          headerRight: () => (
            <Pressable onPress={handleNext} hitSlop={8}>
              <SymbolView
                name="arrow.right"
                tintColor={PlatformColor('label')}
                weight="semibold"
                size={20}
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

        {/* Date range display */}
        <Text style={styles.dateRange}>
          {fmtDisplay(startDate)} — {fmtDisplay(endDate)}
        </Text>

        {/* Hint */}
        <Text style={styles.hint}>
          {pickingEnd ? 'Tap a date for the end' : 'Tap a date for the start'}
        </Text>

        {/* Calendar */}
        <Calendar
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
  dateRange: {
    fontSize: 14,
    color: PlatformColor('secondaryLabel'),
    textAlign: 'center',
  },
  hint: {
    fontSize: 13,
    color: PlatformColor('secondaryLabel'),
    textAlign: 'center',
  },
});
