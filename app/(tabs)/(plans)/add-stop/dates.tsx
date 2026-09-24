import { useMemo, useState } from 'react';
import { PlatformColor, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Calendar, type DateData } from 'react-native-calendars';
import * as Haptics from 'expo-haptics';
import { StopSummary } from '../../../../components/StopSummary';
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
  /** '1' when the start is fixed by the previous stop and only the length is chosen. */
  lockStart?: string;
};

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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

  // Stops chain: every stop after the first starts the day after the
  // previous one ends, so here only the last day is up for choosing.
  const lockStart = params.lockStart === '1';

  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [pickingEnd, setPickingEnd] = useState(lockStart);


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
          title: isEditing ? 'Edit Dates' : 'Dates',
          headerRight: () => (
            <Pressable onPress={handleNext} hitSlop={8} accessibilityRole="button" accessibilityLabel="Next">
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
        <StopSummary city={city} country={country} start={startDate} end={endDate} />

        {/* Calendar */}
        <Calendar
          current={fmt(startDate)}
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
  hint: {
    fontSize: 13,
    color: PlatformColor('secondaryLabel'),
    textAlign: 'center',
  },
});
