import { ActionSheetIOS, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { Trip, parseDate } from '../lib/database';
import { countryCodeToFlag } from '../lib/geocoding';
import { Flag } from './Flag';
import { DaysBadge, listCardStyles } from './ListCard';
import { useTranslation } from '../contexts/LanguageContext';
import { appLocale } from '../lib/i18n/locale';

const hasGlass = isLiquidGlassAvailable();

interface TripCardProps {
  trip: Trip;
  daysOverride?: number;
  hasOverlap?: boolean;
  /** Compact mode: no timeline dot, no country label (used inside country groups) */
  compact?: boolean;
  onDelete?: (id: number) => void;
  onEdit?: (trip: Trip) => void;
}

export function TripCard({ trip, daysOverride, hasOverlap, compact, onDelete, onEdit }: TripCardProps) {
  const { t, countryName } = useTranslation();
  // ActionSheet title still uses the emoji string, native iOS handles it well there.
  const emojiFlag = countryCodeToFlag(trip.country_code);
  const startDate = parseDate(trip.start_date);
  const endDate = trip.end_date ? parseDate(trip.end_date) : null;

  const formatDate = (date: Date) =>
    date.toLocaleDateString(appLocale(), { month: 'short', day: 'numeric' });

  const dateRange = endDate
    ? `${formatDate(startDate)} – ${formatDate(endDate)}`
    : `${formatDate(startDate)} – ${t('comp.present')}`;

  const isActive = !trip.end_date;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/trip/${trip.id}`);
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `${emojiFlag} ${trip.city}`,
        options: [t('common.edit'), t('comp.open'), t('common.delete'), t('common.cancel')],
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

  const cardContent = (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}
    >
      <CardShell {...(hasGlass
        ? { glassEffectStyle: 'regular' as const, style: [styles.card, compact && styles.cardCompact] }
        : { style: [styles.card, compact && styles.cardCompact, styles.cardFallback, hasOverlap && styles.cardFallbackOverlap] }
      )}>
        {hasOverlap && <View style={styles.overlapTint} />}
        <View style={listCardStyles.top}>
          {!compact && <Flag code={trip.country_code} size={22} />}
          {compact && <Text style={styles.cityInline}>{trip.city}</Text>}
          <View style={listCardStyles.topRight}>
            {hasOverlap && (
              <View style={styles.overlapChip}>
                <Text style={styles.overlapChipText}>{t('comp.overlap')}</Text>
              </View>
            )}
            <DaysBadge label={t('comp.daysShort', { n: daysOverride ?? trip.days })} warn={hasOverlap} />
          </View>
        </View>

        {!compact && <Text style={listCardStyles.title}>{trip.city}</Text>}
        {!compact && <Text style={listCardStyles.subtitle}>{countryName(trip.country)}</Text>}

        <View style={styles.cardBottom}>
          <Text style={listCardStyles.meta}>{dateRange}</Text>
          {isActive && <View style={styles.activeDot} />}
        </View>
      </CardShell>
    </Pressable>
  );

  if (compact) return cardContent;

  return (
    <View style={styles.row}>
      {/* This row's slice of the timeline line, sitting on the row itself so it
          also covers any vertical padding. Rows abut with no vertical margin,
          so the slices join into one continuous line, and they virtualize
          along with the row. */}
      <View style={styles.lineSegment} pointerEvents="none" />
      <View style={styles.timelineCol}>
        <View style={styles.dotSpacer} />
        <View style={[styles.dot, isActive && styles.dotActive]} />
      </View>
      {cardContent}
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
  lineSegment: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: TIMELINE_WIDTH / 2 - 1,
    width: 2,
    backgroundColor: Colors.primary + '30',
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
    ...listCardStyles.shell,
    marginBottom: 6,
    marginTop: 2,
  },
  cardCompact: {
    padding: 10,
    marginBottom: 4,
    borderRadius: 10,
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
  cityInline: {
    ...Typography.button,
    flex: 1,
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
    ...Typography.caption,
    fontWeight: '600',
    color: Colors.error,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
    marginLeft: 8,
  },
});
