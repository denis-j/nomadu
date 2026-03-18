import { ActionSheetIOS, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { Trip, parseDate } from '../lib/database';
import { countryCodeToFlag } from '../lib/geocoding';

const hasGlass = isLiquidGlassAvailable();

interface TripCardProps {
  trip: Trip;
  daysOverride?: number;
  hasOverlap?: boolean;
  onDelete?: (id: number) => void;
  onEdit?: (trip: Trip) => void;
}

export function TripCard({ trip, daysOverride, hasOverlap, onDelete, onEdit }: TripCardProps) {
  const flag = countryCodeToFlag(trip.country_code);
  const startDate = parseDate(trip.start_date);
  const endDate = trip.end_date ? parseDate(trip.end_date) : null;

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

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `${flag} ${trip.city}`,
        options: ['Edit', 'Open', 'Delete', 'Cancel'],
        destructiveButtonIndex: 2,
        cancelButtonIndex: 3,
      },
      (index) => {
        if (index === 0) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onEdit?.(trip);
        } else if (index === 1) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/trip/${trip.id}`);
        } else if (index === 2) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          onDelete?.(trip.id);
        }
      }
    );
  };

  const CardShell = hasGlass ? GlassView : View;

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
        onLongPress={handleLongPress}
        delayLongPress={350}
        style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}
      >
        <CardShell {...(hasGlass
          ? { glassEffectStyle: 'regular' as const, style: styles.card }
          : { style: [styles.card, styles.cardFallback, hasOverlap && styles.cardFallbackOverlap] }
        )}>
          {hasOverlap && <View style={styles.overlapTint} />}
          <View style={styles.cardTop}>
            <Text style={styles.flag}>{flag}</Text>
            <View style={styles.cardTopRight}>
              {hasOverlap && (
                <View style={styles.overlapChip}>
                  <Text style={styles.overlapChipText}>⚠ overlap</Text>
                </View>
              )}
              <View style={[styles.daysBadge, hasOverlap && styles.daysBadgeOverlap]}>
                <Text style={[styles.daysText, hasOverlap && styles.daysTextOverlap]}>
                  {daysOverride ?? trip.days}d
                </Text>
              </View>
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
  cardFallbackOverlap: {
    borderColor: '#FF3B3035',
    backgroundColor: '#FF3B300D',
  },
  overlapTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FF3B300D',
    borderRadius: 14,
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
  cardTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  overlapChip: {
    backgroundColor: '#FF3B3018',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  overlapChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF3B30',
  },
  daysBadgeOverlap: {
    backgroundColor: '#FF3B3018',
  },
  daysTextOverlap: {
    color: '#FF3B30',
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
