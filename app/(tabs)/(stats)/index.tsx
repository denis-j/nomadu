import { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Svg, { Circle } from 'react-native-svg';
import { CloudBackdrop, type CloudPatch } from '../../../components/CloudBackdrop';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStats } from '../../../hooks/useStats';
import { useVisaTracker } from '../../../hooks/useVisaTracker';
import { useTaxTracker } from '../../../hooks/useTaxTracker';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { StatsBars } from '../../../components/StatsBars';
import { BADGE_LIBRARY } from '../../../lib/badges';
import { CountryBadge3DPreview } from '../../../components/CountryBadge3D';
import { visaGroup } from '../../../lib/visaCalculations';
import { Flag } from '../../../components/Flag';
import { YearPicker } from '../../../components/YearPicker';
import type { YearFilter } from '../../../lib/yearFilter';
import type { Stats } from '../../../lib/database';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

export default function StatsScreen() {
  const [yearFilter, setYearFilter] = useState<YearFilter>(new Date().getFullYear());
  const { stats, loading, refresh: refreshStats, home } = useStats(yearFilter);
  const { visaStatuses, loading: visaLoading, refresh: refreshVisa } = useVisaTracker();
  const { taxStatuses, loading: taxLoading, refresh: refreshTax } = useTaxTracker();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([
      Promise.all([refreshStats(), refreshVisa(), refreshTax()]),
      new Promise((r) => setTimeout(r, 800)),
    ]);
    setRefreshing(false);
  }, [refreshStats, refreshVisa, refreshTax]);

  // Only what is running now, as on the Visa tab. The list is sorted by
  // urgency, which puts an expired visa first, so the card showed a visa
  // that ended weeks ago as the one being tracked. "Visa needed" entries
  // have no allowance to count down and stay on the Visa tab.
  const activeVisas = visaStatuses.filter((v) => visaGroup(v) === 'active');
  const countedVisas = activeVisas.filter((v) => v.status !== 'visa_needed');
  const mostCritical = countedVisas[0] ?? null;
  const mostCriticalTax = taxStatuses.length > 0 ? taxStatuses[0] : null;

  // Re-trigger bubble animations whenever the Stats tab gains focus
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusKey((k) => k + 1);
    }, []),
  );

  if (loading || visaLoading || taxLoading) return null;

  // Truly empty (no trips at all, ever) → show the placeholder.
  // If only the current year is empty we still want to render the picker so the
  // user can switch years.
  const hasAnyData = stats.availableYears.length > 1 || stats.daysTracked > 0;
  if (!hasAnyData) {
    return (
      <View style={styles.emptyContainer}>
        <StatsBars key={focusKey} size={80} variant="burstWobble" />
        <Text style={styles.emptyTitle}>No stats yet</Text>
        <Text style={styles.emptySubtitle}>
          Once you start tracking,{'\n'}your countries, cities and days will show up here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <YearPicker
        years={stats.availableYears}
        value={yearFilter}
        onChange={setYearFilter}
      />

      {/* Hero: days away, with a share-of-period bar */}
      <StatsHero stats={stats} yearFilter={yearFilter} home={home} />

      {/* Coverage, stated plainly. It is a data-quality hint, not a score:
          the gap is days with no recorded location, not days spent at home. */}
      {yearFilter !== null && stats.daysInWindow > 0 && (
        <Text style={styles.coverage}>
          {stats.daysTracked} of {stats.daysInWindow} days tracked
          {stats.daysTracked < stats.daysInWindow
            ? ` · ${stats.daysInWindow - stats.daysTracked} with no location`
            : ''}
        </Text>
      )}

      {/* 2-col mini grid */}
      <View style={styles.miniRow}>
        <MiniStatCard
          value={stats.totalCountries}
          label="Countries"
          icon="earth"
          accentColor={Colors.textSecondary}
          sublabel={stats.newCountries > 0 ? `${stats.newCountries} new` : undefined}
        />
        <MiniStatCard
          value={stats.totalCities}
          label="Cities"
          icon="location"
          accentColor={Colors.accent}
        />
      </View>
      <View style={styles.miniRow}>
        <MiniStatCard
          value={stats.stops}
          label="Stops"
          icon="footsteps"
          accentColor={Colors.textSecondary}
        />
        <MiniStatCard
          value={stats.avgStayDays ? `${stats.avgStayDays}d` : '0d'}
          label="Average stay"
          icon="time"
          accentColor={Colors.accent}
        />
      </View>

      {/* Active tracking: Visa + Tax side-by-side, always 2-col */}
      <View style={styles.countriesSection}>
        <Text style={styles.sectionTitle}>Active tracking</Text>
        <View style={styles.trackerRow}>
          {mostCritical ? (
            <TrackerCard
              accentColor={Colors.cloudyBlue}
              title="Visa"
              count={activeVisas.length}
              code={mostCritical.destinationCode}
              country={mostCritical.destination}
              daysLeft={mostCritical.daysRemaining}
              total={mostCritical.daysAllowed}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(tabs)/(stats)/visa');
              }}
            />
          ) : (
            <EmptyTrackerCard
              accentColor={Colors.cloudyBlue}
              title="Visa"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(tabs)/(stats)/visa');
              }}
            />
          )}
          {mostCriticalTax ? (
            <TrackerCard
              accentColor={Colors.accent}
              title="Tax"
              count={taxStatuses.length}
              code={mostCriticalTax.countryCode}
              country={mostCriticalTax.country}
              daysLeft={mostCriticalTax.daysRemaining}
              total={mostCriticalTax.thresholdDays}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(tabs)/(stats)/tax');
              }}
            />
          ) : (
            <EmptyTrackerCard
              accentColor={Colors.accent}
              title="Tax"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(tabs)/(stats)/tax');
              }}
            />
          )}
        </View>
      </View>

      {/* Monthly bar chart, only in year mode */}
      {stats.daysAwayByMonth && stats.daysAwayByMonth.some((d: number) => d > 0) && (
        <MonthlyChart days={stats.daysAwayByMonth} year={yearFilter as number} />
      )}

      {/* Badge Library overview, always all-time; the year filter does not apply */}
      <BadgesSection visitedCodes={new Set(stats.allTimeCountryCodes)} />

      {/* Top destinations, horizontal scroll */}
      {stats.topCountries.length > 0 && (
        <View style={styles.topDestSection}>
          <Text style={[styles.sectionTitle, { paddingLeft: 0 }]}>Top destinations</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={topStyles.row}
          >
            {stats.topCountries.map((country, index) => (
              <TopDestinationCard
                key={country.country_code + index}
                rank={index + 1}
                code={country.country_code}
                country={country.country}
                days={country.days}
              />
            ))}
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Hero card ─────────────────────────────────────────────────────────────

/** UN member states plus observers, the denominator for "of the world". */
const TOTAL_COUNTRIES = 195;

const RING_SIZE = 72;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Cloud patches for the card's proportions. The button's set is tuned for a
 * low strip; a card has room for a few larger, softer masses, drifting up
 * from the lower left the way the "N" in the logo does.
 */
const HERO_PATCHES: CloudPatch[] = [
  { x: 0.20, y: 0.78, rx: 0.24, ry: 0.34 },
  { x: 0.50, y: 0.92, rx: 0.20, ry: 0.26 },
  { x: 0.80, y: 0.28, rx: 0.18, ry: 0.30 },
  { x: 0.92, y: 0.80, rx: 0.12, ry: 0.22 },
  { x: 0.48, y: 0.10, rx: 0.14, ry: 0.16 },
];

/**
 * The headline card, painted with the brand's cloud surface.
 *
 * A flat gradient made it read like any dashboard tile. The CloudBackdrop is
 * the same rendering the primary button uses, so the card belongs to the app
 * instead of to a template. The number is heavy and tabular so digits do not
 * shimmer when they change.
 */
function StatsHero({
  stats,
  yearFilter,
  home,
}: {
  stats: Stats;
  yearFilter: YearFilter;
  home: { code: string; country: string } | null;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const isYearMode = yearFilter !== null;

  // "Days tracked" could only ever answer how complete the location history is,
  // because a person is always somewhere. Days away from the home country is a
  // number that separates someone who travelled from someone who didn't.
  const value = isYearMode ? stats.daysAway : stats.totalCountries;
  const unit = isYearMode
    ? `${stats.daysAway === 1 ? 'day' : 'days'} away${home ? ` from ${home.country}` : ''}`
    : `${stats.totalCountries === 1 ? 'country' : 'countries'} visited`;

  const pct = isYearMode
    ? (stats.daysInWindow > 0 ? Math.min(100, (stats.daysAway / stats.daysInWindow) * 100) : 0)
    : Math.min(100, (stats.totalCountries / TOTAL_COUNTRIES) * 100);
  // One word. The denominator (the days elapsed) is already on screen in the
  // coverage line right under the card; repeating it inside a 72px ring
  // squeezed three words into eight-point type.
  const ringSub = isYearMode ? 'away' : 'of world';
  const dashOffset = RING_CIRCUMFERENCE * (1 - pct / 100);

  return (
    <View
      style={heroStyles.card}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
      }}
    >
      <CloudBackdrop width={size.w} height={size.h} patches={HERO_PATCHES} blur={7} />
      <View style={heroStyles.row}>
        <View style={heroStyles.textBlock}>
          <Text style={heroStyles.eyebrow}>{isYearMode ? `${yearFilter}` : 'All time'}</Text>
          <Text style={heroStyles.value}>{value}</Text>
          <Text style={heroStyles.unit}>{unit}</Text>
        </View>
        <View style={heroStyles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke="rgba(255,255,255,0.45)"
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={Colors.white}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </Svg>
          <View style={heroStyles.ringCenter}>
            <Text style={heroStyles.ringPct}>{Math.round(pct)}%</Text>
            <Text style={heroStyles.ringSub}>{ringSub}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const heroStyles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: 20,
    minHeight: 148,
    justifyContent: 'center',
    // Same glassy edge as the button, so the two read as one material.
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  textBlock: {
    flex: 1,
  },
  eyebrow: {
    ...Typography.eyebrow,
    color: Colors.cloudyButtonText,
    opacity: 0.7,
  },
  value: {
    fontSize: 52,
    fontWeight: '800',
    color: Colors.cloudyButtonText,
    letterSpacing: -1.5,
    lineHeight: 58,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  unit: {
    ...Typography.bodyMedium,
    color: Colors.cloudyButtonText,
    opacity: 0.75,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPct: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.cloudyButtonText,
    letterSpacing: -0.5,
  },
  ringSub: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.cloudyButtonText,
    opacity: 0.65,
    letterSpacing: 0.3,
    marginTop: -1,
  },
});



// ─── Mini stat card, for the 2-col grid ───────────────────────────────────

function MiniStatCard({
  value,
  label,
  icon,
  accentColor,
  sublabel,
}: {
  value: number | string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  sublabel?: string;
}) {
  return (
    <Glass
      {...glassProps}
      style={[miniStyles.card, !hasGlass && miniStyles.cardFallback]}
    >
      <View style={miniStyles.header}>
        <Text style={miniStyles.label}>{label}</Text>
        <View style={[miniStyles.iconBubble, { backgroundColor: accentColor + '20' }]}>
          <Ionicons name={icon} size={18} color={accentColor} />
        </View>
      </View>
      <Text style={miniStyles.value}>{value}</Text>
      {sublabel ? <Text style={miniStyles.sublabel}>{sublabel}</Text> : null}
    </Glass>
  );
}

const miniStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 20,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: 16,
    gap: 14,
  },
  cardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  label: {
    ...Typography.label,
    color: Colors.textSecondary,
    flex: 1,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sublabel: {
    ...Typography.caption,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  value: {
    ...Typography.numericLarge,
    fontSize: 32,
  },
});

// ─── Tracker card, for the Visa / Tax 2-col grid ──────────────────────────

function TrackerCard({
  accentColor,
  title,
  count,
  code,
  country,
  daysLeft,
  total,
  onPress,
}: {
  accentColor: string;
  title: string;
  count?: number;
  code: string;
  country: string;
  daysLeft: number;
  total: number;
  onPress: () => void;
}) {
  // Progress shows "how much of the allowance is LEFT", so a fresh start
  // (daysLeft == total) is a full bar, and approaching zero drains it.
  const pct = total > 0 ? Math.max(0, Math.min(100, (daysLeft / total) * 100)) : 0;
  const isUrgent = pct < 15;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [trackerStyles.pressable, pressed && { opacity: 0.85 }]}
    >
      <Glass
        {...glassProps}
        style={[trackerStyles.card, !hasGlass && trackerStyles.cardFallback]}
      >
        <View style={trackerStyles.headerBlock}>
          <View style={trackerStyles.titleRow}>
            <Text style={trackerStyles.title}>{title}</Text>
            {count && count > 1 ? (
              <View style={[trackerStyles.countBadge, { backgroundColor: accentColor + '22' }]}>
                <Text style={[trackerStyles.countBadgeText, { color: accentColor }]}>+{count - 1}</Text>
              </View>
            ) : null}
          </View>
          <View style={trackerStyles.countryRow}>
            <Flag code={code} size={16} />
            <Text style={trackerStyles.country} numberOfLines={1}>
              {country}
            </Text>
          </View>
        </View>

        <View style={trackerStyles.dataBlock}>
          <View style={trackerStyles.valueRow}>
            <Text style={[trackerStyles.value, isUrgent && { color: Colors.error }]}>
              {daysLeft}
            </Text>
            {/* Days left, so say so: "109 / 183 days" read as 109 used. */}
            <Text style={trackerStyles.unit}>of {total} left</Text>
          </View>
          <View style={trackerStyles.progressTrack}>
            <View
              style={[
                trackerStyles.progressFill,
                { width: `${pct}%`, backgroundColor: isUrgent ? Colors.error : accentColor },
              ]}
            />
          </View>
        </View>

        <View style={trackerStyles.cornerChevron}>
          <Ionicons name="chevron-forward" size={13} color={Colors.textTertiary} />
        </View>
      </Glass>
    </Pressable>
  );
}

// ─── Empty tracker card, shown when a tracker isn't set up ────────────────

function EmptyTrackerCard({
  accentColor,
  title,
  onPress,
}: {
  accentColor: string;
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [trackerStyles.pressable, pressed && { opacity: 0.7 }]}
    >
      <Glass
        {...glassProps}
        style={[trackerStyles.card, trackerStyles.emptyCard, !hasGlass && trackerStyles.cardFallback]}
      >
        <View style={trackerStyles.headerBlock}>
          <Text style={trackerStyles.title}>{title}</Text>
          <Text style={trackerStyles.country} numberOfLines={1}>
            Not tracking
          </Text>
        </View>

        <View style={trackerStyles.emptyCta}>
          <Text style={[trackerStyles.emptyCtaText, { color: accentColor }]}>Set up</Text>
          <Ionicons name="chevron-forward" size={13} color={accentColor} />
        </View>
      </Glass>
    </Pressable>
  );
}

const trackerStyles = StyleSheet.create({
  pressable: {
    flex: 1,
  },
  card: {
    borderRadius: 20,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: 16,
    justifyContent: 'space-between',
    minHeight: 168,
  },
  cardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  headerBlock: {
    gap: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    ...Typography.eyebrow,
    fontSize: 10,
    color: Colors.textTertiary,
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderCurve: 'continuous',
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.2,
  },
  cornerChevron: {
    position: 'absolute',
    top: 14,
    right: 14,
    opacity: 0.55,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  country: {
    ...Typography.bodySmall,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  dataBlock: {
    gap: 8,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  value: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    ...Typography.bodySmall,
    color: Colors.textTertiary,
    fontWeight: '500',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  // Empty state
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  emptyCtaText: {
    ...Typography.bodySmall,
    fontWeight: '700',
  },
});

// ─── Monthly trips chart ───────────────────────────────────────────────────

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function MonthlyChart({ days, year }: { days: number[]; year: number }) {
  const max = Math.max(...days);
  const total = days.reduce((sum, d) => sum + d, 0);
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const isThisYear = year === currentYear;
  const peakMonth = days.indexOf(max);

  return (
    <Glass
      {...glassProps}
      style={[chartStyles.card, !hasGlass && chartStyles.cardFallback]}
    >
      <View style={chartStyles.header}>
        <Text style={chartStyles.eyebrow}>Days away by month</Text>
        <Text style={chartStyles.totalValue}>
          {total}
          <Text style={chartStyles.totalUnit}> total</Text>
        </Text>
      </View>

      <View style={chartStyles.barsRow}>
        {days.map((value, i) => {
          const isHighlighted = isThisYear ? i === currentMonth : i === peakMonth;
          // Cap at 88% to leave headroom for the value label above the bar
          const barHeight = max > 0 ? (value / max) * 88 : 0;
          return (
            <View key={i} style={chartStyles.barCol}>
              <View style={chartStyles.barTrack}>
                <View
                  style={[
                    chartStyles.barFill,
                    {
                      height: `${barHeight}%`,
                      backgroundColor: isHighlighted
                        ? Colors.cloudyBlue
                        : value > 0
                        ? 'rgba(0, 0, 0, 0.12)'
                        : 'rgba(0, 0, 0, 0.05)',
                    },
                  ]}
                />
                {value > 0 && (
                  <Text
                    style={[
                      chartStyles.barValue,
                      isHighlighted && { color: Colors.cloudyBlue },
                    ]}
                  >
                    {value}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  chartStyles.barLabel,
                  isHighlighted && chartStyles.barLabelActive,
                ]}
              >
                {MONTH_LABELS[i]}
              </Text>
            </View>
          );
        })}
      </View>
    </Glass>
  );
}

const chartStyles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: 16,
    paddingBottom: 12,
    gap: 16,
  },
  cardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  eyebrow: {
    ...Typography.eyebrow,
    fontSize: 10,
    color: Colors.textSecondary,
  },
  totalValue: {
    ...Typography.titleMedium,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  totalUnit: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 168,
    gap: 3,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
  },
  // column-reverse → barFill is first child = sits at the bottom,
  // value text is second child = floats directly above the bar with a small gap.
  barTrack: {
    flex: 1,
    width: '100%',
    flexDirection: 'column-reverse',
    alignItems: 'center',
  },
  barFill: {
    width: '100%',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    minHeight: 8,
  },
  barValue: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  barLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textTertiary,
    marginTop: 8,
    letterSpacing: 0.2,
  },
  barLabelActive: {
    color: Colors.text,
    fontWeight: '700',
  },
});

// ─── Top destination card, a horizontal scroll item ──────────────────────

function TopDestinationCard({
  rank,
  code,
  country,
  days,
}: {
  rank: number;
  code: string;
  country: string;
  days: number;
}) {
  const isPodium = rank === 1;
  return (
    <Glass
      {...glassProps}
      style={[topStyles.card, !hasGlass && topStyles.cardFallback]}
    >
      <View style={topStyles.topRow}>
        <Text style={topStyles.rank}>#{rank}</Text>
        {isPodium && (
          <View style={topStyles.crownBubble}>
            <Ionicons name="trophy" size={11} color={Colors.textSecondary} />
          </View>
        )}
      </View>

      <View style={topStyles.flagWrap}>
        <Flag code={code} size={32} />
      </View>

      <View style={topStyles.bottom}>
        <Text style={topStyles.country} numberOfLines={1}>
          {country}
        </Text>
        <View style={topStyles.daysRow}>
          <Text style={topStyles.days}>{days}</Text>
          <Text style={topStyles.daysUnit}>days</Text>
        </View>
      </View>
    </Glass>
  );
}

const topStyles = StyleSheet.create({
  row: {
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  card: {
    width: 132,
    borderRadius: 20,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: 14,
    gap: 8,
    minHeight: 156,
  },
  cardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rank: {
    ...Typography.eyebrow,
    fontSize: 10,
    color: Colors.textTertiary,
  },
  crownBubble: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagWrap: {
    marginVertical: 2,
    alignItems: 'flex-start',
  },
  bottom: {
    marginTop: 'auto',
    gap: 2,
  },
  country: {
    ...Typography.bodySmall,
    fontWeight: '700',
  },
  daysRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  days: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  daysUnit: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
});

// ─── Badges section ─────────────────────────────────────────────────────────

function BadgesSection({ visitedCodes }: { visitedCodes: Set<string> }) {
  const earned = BADGE_LIBRARY.filter((b) => visitedCodes.has(b.code));
  return (
    <View style={badgeStyles.section}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/library/badges');
        }}
        style={({ pressed }) => [badgeStyles.sectionHeader, pressed && { opacity: 0.6 }]}
      >
        <Text style={badgeStyles.sectionTitle}>Badges</Text>
        <View style={badgeStyles.progressLink}>
          <Text style={badgeStyles.progressValue}>{earned.length}</Text>
          <Text style={badgeStyles.progressTotal}>
            / {BADGE_LIBRARY.length} collected
          </Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
        </View>
      </Pressable>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={badgeStyles.row}
      >
        {BADGE_LIBRARY.map((b) => {
          const isEarned = visitedCodes.has(b.code);
          return (
            <Pressable
              key={b.code}
              disabled={!isEarned}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/badge/${b.code}`);
              }}
              style={({ pressed }) => [
                badgeStyles.pressable,
                pressed && isEarned && { opacity: 0.7 },
              ]}
            >
              <Glass
                {...glassProps}
                style={[badgeStyles.tile, !hasGlass && badgeStyles.tileFallback]}
              >
                {!isEarned && (
                  <View style={badgeStyles.lockBubble}>
                    <Ionicons name="lock-closed" size={11} color={Colors.textTertiary} />
                  </View>
                )}
                <View style={badgeStyles.tileModel}>
                  {isEarned ? (
                    <CountryBadge3DPreview countryCode={b.code} backgroundColor={Colors.surface} />
                  ) : (
                    <View style={badgeStyles.lockedPlaceholder}>
                      <Ionicons name="medal" size={42} color="rgba(0, 0, 0, 0.08)" />
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    badgeStyles.tileName,
                    !isEarned && { color: Colors.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {b.name}
                </Text>
              </Glass>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  section: {
    gap: 12,
    marginHorizontal: -16,
    paddingLeft: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingRight: 16,
  },
  sectionTitle: {
    ...Typography.eyebrow,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  progressLink: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  progressValue: {
    ...Typography.titleMedium,
    fontWeight: '800',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  progressTotal: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  row: {
    gap: 10,
    paddingRight: 16,
  },
  pressable: {
    width: 112,
    aspectRatio: 0.82,
  },
  tile: {
    flex: 1,
    borderRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  tileFallback: {
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  lockBubble: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 7,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  tileModel: {
    width: '100%',
    flex: 1,
    overflow: 'hidden',
    borderRadius: 12,
  },
  lockedPlaceholder: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileName: {
    ...Typography.caption,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginTop: 6,
  },
});

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  emptyTitle: {
    ...Typography.titleLarge,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginTop: 8,
  },
  emptySubtitle: {
    ...Typography.bodySmall,
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  coverage: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: -4,
  },
  miniRow: {
    flexDirection: 'row',
    gap: 12,
  },
  trackerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  cardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardWide: {
    flex: 2,
  },
  combiRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  combiStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  combiDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border,
  },
  combiValue: {
    ...Typography.numericLarge,
  },
  combiLabel: {
    ...Typography.label,
  },
  countriesSection: {
    gap: 10,
  },
  topDestSection: {
    gap: 10,
    marginHorizontal: -16,
    paddingLeft: 16,
  },
  sectionTitle: {
    ...Typography.eyebrow,
    fontSize: 13,
    paddingLeft: 4,
  },
  cardPressed: {
    opacity: 0.7,
  },
  visaCard: {
    borderRadius: 20,
    padding: 18,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  visaCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  visaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  visaFlag: {
    fontSize: 28,
  },
  visaText: {
    flex: 1,
    gap: 2,
  },
  visaDestination: {
    ...Typography.titleSmall,
    fontWeight: '700',
  },
  visaPreview: {
    ...Typography.label,
    fontVariant: ['tabular-nums'],
  },
});
