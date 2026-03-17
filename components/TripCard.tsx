import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { Trip } from '../lib/database';
import { countryCodeToFlag } from '../lib/geocoding';

const hasGlass = isLiquidGlassAvailable();

interface TripCardProps {
  trip: Trip;
}

export function TripCard({ trip }: TripCardProps) {
  const flag = countryCodeToFlag(trip.country_code);
  const startDate = new Date(trip.start_date);
  const endDate = trip.end_date ? new Date(trip.end_date) : null;

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const dateRange = endDate
    ? `${formatDate(startDate)} – ${formatDate(endDate)}`
    : `${formatDate(startDate)} – Present`;

  const isActive = !trip.end_date;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/trip/${trip.id}`);
  };

  const CardShell = hasGlass ? GlassView : View;
  const cardShellProps = hasGlass
    ? { glassEffectStyle: 'regular' as const, style: styles.card }
    : { style: [styles.card, styles.cardFallback] };

  return (
    <View style={styles.row}>
      {/* Dot only — the line is drawn once in the parent ScrollView */}
      <View style={styles.timelineCol}>
        <View style={styles.dotSpacer} />
        <View style={[styles.dot, isActive && styles.dotActive]} />
      </View>

      {/* Card */}
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}
      >
        <CardShell {...cardShellProps}>
          <View style={styles.cardTop}>
            <Text style={styles.flag}>{flag}</Text>
            <View style={styles.daysBadge}>
              <Text style={styles.daysText}>{trip.days}d</Text>
            </View>
          </View>

          <Text style={styles.city}>{trip.city}</Text>
          <Text style={styles.country}>{trip.country}</Text>

          <View style={styles.cardBottom}>
            <Text style={styles.dates}>{dateRange}</Text>
            {isActive && <View style={styles.activeDot} />}
          </View>
        </CardShell>
      </Pressable>
    </View>
  );
}

const DOT_SIZE = 12;
const DOT_ACTIVE_SIZE = 14;
const TIMELINE_WIDTH = 28;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingRight: 16,
  },
  timelineCol: {
    width: TIMELINE_WIDTH,
    alignItems: 'center',
  },
  dotSpacer: {
    height: 20,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.background,
    zIndex: 1,
  },
  dotActive: {
    width: DOT_ACTIVE_SIZE,
    height: DOT_ACTIVE_SIZE,
    borderRadius: DOT_ACTIVE_SIZE / 2,
    backgroundColor: Colors.primary,
    borderWidth: 0,
  },
  card: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 6,
    marginTop: 2,
    overflow: 'hidden',
  },
  cardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardPressable: {
    flex: 1,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  flag: {
    fontSize: 28,
  },
  daysBadge: {
    backgroundColor: Colors.primary + '18',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  daysText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  city: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  country: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dates: {
    fontSize: 13,
    color: Colors.textTertiary,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
    marginLeft: 8,
  },
});
