import { useMemo, useState } from 'react';
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Calendar, type DateData } from 'react-native-calendars';
import * as Haptics from 'expo-haptics';
import { Card, SectionLabel } from '../../../components/visaForm';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { guideById, guideDays } from '../../../constants/guides';
import { parseDate } from '../../../lib/database';
import { createTripFromGuide } from '../../../lib/guides';

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const human = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

const RANGE_COLOR = '#000000';
const RANGE_BG = 'rgba(0,0,0,0.08)';

/**
 * When does it start? The one thing a guide cannot know.
 *
 * The route's stops keep their spacing; picking the first day shifts the
 * whole thing, so the calendar shows what the trip would cover before it
 * is created.
 */
export default function GuideStartScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const guide = guideById(id);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [start, setStart] = useState(tomorrow);
  const [busy, setBusy] = useState(false);

  const days = guide ? guideDays(guide) : 0;
  const end = useMemo(() => {
    const d = new Date(start);
    d.setDate(d.getDate() + Math.max(days - 1, 0));
    return d;
  }, [start, days]);

  const marked = useMemo(() => {
    const marks: Record<string, any> = {};
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = fmt(cursor);
      const isStart = key === fmt(start);
      const isEnd = key === fmt(end);
      marks[key] = {
        startingDay: isStart,
        endingDay: isEnd,
        color: isStart || isEnd ? RANGE_COLOR : RANGE_BG,
        textColor: isStart || isEnd ? '#fff' : '#000',
      };
      cursor.setDate(cursor.getDate() + 1);
    }
    return marks;
  }, [start, end]);

  const create = async () => {
    if (!guide || busy) return;
    setBusy(true);
    try {
      const journeyId = await createTripFromGuide(guide, start);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/(tabs)/(plans)/${journeyId}` as any);
    } catch (err) {
      console.error('Failed to create trip from guide:', err);
      setBusy(false);
    }
  };

  if (!guide) return <Stack.Screen options={{ title: 'Start date' }} />;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Start date',
          headerRight: () => (
            <Pressable onPress={create} disabled={busy} hitSlop={8} style={{ opacity: busy ? 0.4 : 1 }}>
              <SymbolView name="checkmark" tintColor={PlatformColor('label')} weight="semibold" size={22} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <Text style={styles.place}>{guide.country}</Text>
          <Text style={styles.span}>
            {human(start)} – {human(end)} · {days} {days === 1 ? 'day' : 'days'}
          </Text>
        </View>

        <SectionLabel>First day</SectionLabel>
        <Card>
          <Calendar
            current={fmt(start)}
            minDate={fmt(new Date())}
            markingType="period"
            markedDates={marked}
            onDayPress={(day: DateData) => {
              Haptics.selectionAsync();
              setStart(parseDate(day.dateString));
            }}
            theme={{
              backgroundColor: 'transparent',
              calendarBackground: 'transparent',
              textSectionTitleColor: '#8E8E93',
              dayTextColor: '#000',
              todayTextColor: '#000',
              monthTextColor: '#000',
              textMonthFontWeight: '700',
              textDayFontSize: 16,
              textMonthFontSize: 17,
              textDayHeaderFontSize: 13,
              textDisabledColor: '#C7C7CC',
              arrowColor: '#000',
            }}
          />
        </Card>
        <Text style={styles.foot}>The stops keep their order and length. Dates, notes and stays stay editable afterwards.</Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14, paddingBottom: 80 },
  head: { gap: 2, paddingHorizontal: 4 },
  place: { ...Typography.titleSmall, fontSize: 17 },
  span: { ...Typography.bodySmall, color: Colors.textSecondary },
  foot: { ...Typography.bodySmall, color: Colors.textTertiary, paddingHorizontal: 4 },
});
