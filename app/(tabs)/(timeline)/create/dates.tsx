import { useMemo, useState, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { systemColor } from '../../../../constants/colors';
import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { Calendar, type DateData } from 'react-native-calendars';
import * as Haptics from 'expo-haptics';
import { insertTripManual, updateTripGroup, parseDate } from '../../../../lib/database';
import { cityCoords } from '../../../../lib/geocoding';
import { getCountryCode } from '../../../../utils/geography';
import { showToast } from '../../../../lib/toast';
import { hasBadge, isBadgeUnlocked, setPendingUnlock } from '../../../../lib/badges';
import { track } from '../../../../lib/analytics';
import { useTranslation } from '../../../../contexts/LanguageContext';
import { HeaderAction } from '../../../../components/HeaderAction';
import { FontSize } from '../../../../constants/typography';
import { Card, SwitchRow } from '../../../../components/visaForm';

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

const RANGE_COLOR = '#000000';
const RANGE_BG = 'rgba(0,0,0,0.08)';

export default function CreateDatesScreen() {
  const { t, countryName } = useTranslation();
  const parentNav = useNavigation();
  const params = useLocalSearchParams<Params>();
  const { country, city } = params;
  const isEditing = !!params.id;
  // Read on every render rather than once at module load: the module stays
  // loaded for the whole session, so after midnight the real today was
  // past maxDate and could not be picked.
  const todayStr = fmt(new Date());

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

  // A ref, not the state: two taps in the same frame both still see
  // `saving` as false, and each would add the trip.
  const savingRef = useRef(false);
  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const code = getCountryCode(country);
      const s = fmt(startDate);
      const e = noEndDate ? null : fmt(endDate);
      const coords = await cityCoords(city, country, code);
      if (isEditing && params.id) {
        await updateTripGroup(
          Number(params.id), city, country, code, s, e,
          coords?.latitude, coords?.longitude,
        );
      } else {
        await insertTripManual(city, country, code, s, e, coords?.latitude, coords?.longitude);
        track({ name: 'trip_added', props: { method: 'manual' } });
      }
      // If this trip's country has a badge and we haven't shown it before,
      // queue an unlock. The timeline screen will trigger the fullscreen modal
      // once it regains focus (can't push fullScreenModal from inside a sheet).
      if (!isEditing && hasBadge(code)) {
        const alreadyUnlocked = await isBadgeUnlocked(code);
        if (!alreadyUnlocked) {
          await setPendingUnlock(code);
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      parentNav.getParent()?.goBack();
      showToast(isEditing ? t('timelineCreate.tripUpdated') : t('timelineCreate.tripAdded'));
    } catch (err) {
      console.error('Failed to save trip:', err);
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: isEditing ? t('timelineCreate.editDates') : t('timelineCreate.tripDates'),
          headerRight: () => <HeaderAction onPress={handleSave} label={t('timelineCreate.saveTrip')} disabled={saving} />,
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {/* Location + days summary */}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLocation}>{city}, {countryName(country)}</Text>
          <View style={styles.daysBubble}>
            <Text style={styles.daysText}>{t('comp.daysShort', { n: days })}</Text>
          </View>
        </View>

        {/* Hint */}
        {!noEndDate && (
          <Text style={styles.hint}>
            {pickingEnd ? t('timelineCreate.tapEnd') : t('timelineCreate.tapStart')}
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
        <Card>
          <SwitchRow
            title={t('timelineCreate.stillTraveling')}
            value={noEndDate}
            onChange={(v) => {
              setNoEndDate(v);
              if (!v) setPickingEnd(false);
            }}
            last
          />
        </Card>
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
    fontSize: FontSize.callout,
    fontWeight: '600',
    color: systemColor('label'),
    flex: 1,
  },
  daysBubble: {
    backgroundColor: systemColor('systemGray5'),
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  daysText: {
    fontSize: FontSize.subheadline,
    fontWeight: '700',
    color: systemColor('label'),
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontSize: FontSize.footnote,
    color: systemColor('secondaryLabel'),
    textAlign: 'center',
  },
});
