import { useCallback, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import { Host, Menu, Button as ExpoUIButton, Image as ExpoUIImage } from '@expo/ui/swift-ui';
import * as Haptics from 'expo-haptics';
import { useTrips } from '../../../hooks/useTrips';
import { TripCard } from '../../../components/TripCard';
import { TimelineBubbles } from '../../../components/TimelineBubbles';
import { CloudyButton } from '../../../components/CloudyButton';
import { pickImportImages, setPendingImportImages } from '../../../lib/tripImport';
import { takePendingUnlock } from '../../../lib/badges';
import { BadgeUnlockOverlay } from '../../../components/BadgeUnlockOverlay';
import { Colors } from '../../../constants/colors';
import { Trip, markTripDeleted, parseDate } from '../../../lib/database';
import { countryCodeToFlag } from '../../../lib/geocoding';
import { LinearGradient } from 'react-native-svg';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const hasGlass = isLiquidGlassAvailable();

// ─── Gap indicator ───

function GapIndicator({ fromDate, toDate, days, onAdd }: {
  fromDate: Date;
  toDate: Date;
  days: number;
  onAdd: (from: Date, to: Date) => void;
}) {
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <TouchableOpacity style={gapStyles.row} onPress={() => onAdd(fromDate, toDate)} activeOpacity={0.7}>
      <View style={gapStyles.dotCol} />
      <View style={gapStyles.card}>
        <View style={gapStyles.left}>
          <Text style={gapStyles.days}>{days}d untracked</Text>
          <Text style={gapStyles.dates}>{fmt(fromDate)} – {fmt(toDate)}</Text>
        </View>
        <Ionicons name="add-circle-outline" size={20} color={Colors.primary + '80'} />
      </View>
    </TouchableOpacity>
  );
}

const gapStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingRight: 16,
  },
  dotCol: {
    width: 28,
  },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    borderStyle: 'dashed',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 6,
  },
  left: {
    gap: 2,
  },
  days: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary + 'AA',
  },
  dates: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
});

// ─── Timeline empty state ───

function TimelineEmpty({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  // Bump key every time the Timeline tab gains focus → bubbles remount + re-animate
  const [focusKey, setFocusKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusKey((k) => k + 1);
    }, []),
  );
  return (
    <View style={emptyStyles.container}>
      <TimelineBubbles key={focusKey} size={70} variant="burstWobble" />

      <Text style={emptyStyles.title}>Start your travel timeline</Text>
      <Text style={emptyStyles.subtitle}>
        Trips appear here automatically as you move,{'\n'}or you can add them yourself.
      </Text>

      <CloudyButton onPress={onImport}>
        <View style={emptyStyles.cloudyBtnContent}>
          <Ionicons name="sparkles" size={22} color="#0B2541" />
          <Text style={emptyStyles.cloudyTitle}>Import from screenshots</Text>
        </View>
      </CloudyButton>

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onAdd();
        }}
        style={({ pressed }) => [emptyStyles.secondaryBtn, pressed && emptyStyles.secondaryBtnPressed]}
      >
        <Ionicons name="add-circle-outline" size={20} color={Colors.text} />
        <Text style={emptyStyles.secondaryBtnText}>Add a trip manually</Text>
      </Pressable>

      <Text style={emptyStyles.hint}>
        Or just travel — automatic tracking will fill this in.
      </Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  variantLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 4,
    marginBottom: -8,
  },
  heroImage: {
    width: 220,
    height: 140,
    marginBottom: -16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: -0.4,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  cloudyBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flex: 1,
  },
  cloudyTitle: { color: '#0B2541', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    width: '100%',
    maxWidth: 360,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  secondaryBtnPressed: { opacity: 0.55 },
  secondaryBtnText: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  pressedBtn: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  hint: { fontSize: 12, color: Colors.textTertiary, textAlign: 'center', marginTop: 8 },
});

// ─── Country group (collapsible) ───

interface CountryGroupData {
  countryCode: string;
  country: string;
  items: { trip: Trip; daysInMonth: number }[];
  totalDays: number;
}

/** Groups consecutive same-country trips within a section's sorted data. */
function groupByCountryRuns(
  sortedData: { trip: Trip; daysInMonth: number }[],
): (CountryGroupData | { trip: Trip; daysInMonth: number })[] {
  const result: (CountryGroupData | { trip: Trip; daysInMonth: number })[] = [];
  let i = 0;
  while (i < sortedData.length) {
    const current = sortedData[i];
    const code = current.trip.country_code;
    // Look ahead for consecutive trips in the same country
    let j = i + 1;
    while (j < sortedData.length && sortedData[j].trip.country_code === code) j++;
    const runLength = j - i;
    if (runLength >= 2) {
      const items = sortedData.slice(i, j);
      const totalDays = items.reduce((s, d) => s + d.daysInMonth, 0);
      result.push({
        countryCode: code,
        country: current.trip.country,
        items,
        totalDays,
      });
    } else {
      result.push(current);
    }
    i = j;
  }
  return result;
}

function isCountryGroup(
  item: CountryGroupData | { trip: Trip; daysInMonth: number },
): item is CountryGroupData {
  return 'items' in item && 'countryCode' in item;
}

const EXPAND_CONFIG = LayoutAnimation.create(
  250,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.scaleY,
);

function CountryGroupCard({
  group,
  overlappingTripIds,
  onDelete,
  onEdit,
}: {
  group: CountryGroupData;
  overlappingTripIds: Set<number>;
  onDelete: (id: number) => void;
  onEdit: (trip: Trip) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const flag = countryCodeToFlag(group.countryCode);

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(EXPAND_CONFIG);
    setExpanded((prev) => !prev);
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `${flag} ${group.country} — ${group.items.length} stops`,
        options: ['Delete All Stops', 'Cancel'],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      (index) => {
        if (index === 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          LayoutAnimation.configureNext(EXPAND_CONFIG);
          for (const { trip } of group.items) {
            onDelete(trip.id);
          }
        }
      },
    );
  };

  // Date range: earliest start → latest end across all items
  const earliest = group.items[group.items.length - 1].trip.start_date;
  const latestTrip = group.items[0].trip;
  const latestEnd = latestTrip.end_date;
  const isActive = !latestEnd;

  const fmtShort = (s: string) => {
    const d = parseDate(s);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const dateRange = latestEnd
    ? `${fmtShort(earliest)} – ${fmtShort(latestEnd)}`
    : `${fmtShort(earliest)} – Present`;

  const GroupShell = hasGlass ? GlassView : View;

  return (
    <View style={groupStyles.wrapper}>
      {/* Country group header */}
      <TouchableOpacity
        onPress={toggle}
        onLongPress={handleLongPress}
        delayLongPress={350}
        activeOpacity={0.7}
        style={groupStyles.row}
      >
        <View style={groupStyles.timelineCol}>
          <View style={groupStyles.dotSpacer} />
          <View style={[groupStyles.dot, isActive && groupStyles.dotFilled]} />
        </View>
        <GroupShell
          {...(hasGlass
            ? { glassEffectStyle: 'regular' as const, style: groupStyles.header }
            : { style: [groupStyles.header, groupStyles.headerFallback] })}
        >
          <View style={groupStyles.headerTop}>
            <Text style={groupStyles.flag}>{flag}</Text>
            <View style={groupStyles.headerRight}>
              <View style={groupStyles.countChip}>
                <Text style={groupStyles.countChipText}>
                  {group.items.length} stops
                </Text>
              </View>
              <View style={groupStyles.daysBadge}>
                <Text style={groupStyles.daysText}>{group.totalDays}d</Text>
              </View>
            </View>
          </View>
          <Text style={groupStyles.country}>{group.country}</Text>
          <View style={groupStyles.headerBottom}>
            <Text style={groupStyles.dates}>{dateRange}</Text>
            {isActive && <View style={groupStyles.activeDot} />}
            <View style={{ flex: 1 }} />
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.textTertiary}
            />
          </View>
        </GroupShell>
      </TouchableOpacity>

      {/* Expanded children */}
      {expanded && (
        <View style={groupStyles.childrenWrap}>
          {group.items.map(({ trip, daysInMonth }) => (
            <TripCard
              key={trip.id}
              trip={trip}
              daysOverride={daysInMonth}
              hasOverlap={overlappingTripIds.has(trip.id)}
              compact
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const DOT_SIZE = 12;
const DOT_ACTIVE_SIZE = 14;
const TIMELINE_WIDTH = 28;

const groupStyles = StyleSheet.create({
  wrapper: {
    marginBottom: 2,
  },
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
  dotFilled: {
    width: DOT_ACTIVE_SIZE,
    height: DOT_ACTIVE_SIZE,
    borderRadius: DOT_ACTIVE_SIZE / 2,
    backgroundColor: Colors.primary,
    borderWidth: 0,
  },
  header: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 6,
    marginTop: 2,
    overflow: 'hidden',
  },
  headerFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  flag: {
    fontSize: 28,
  },
  countChip: {
    backgroundColor: Colors.accent + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  countChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.accent,
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
  country: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  headerBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
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
  childrenWrap: {
    overflow: 'hidden',
    paddingLeft: TIMELINE_WIDTH + 10,
    paddingRight: 16,
  },
});

// ─── Gap computation ───

interface GapInterval { from: Date; to: Date; days: number }

function computeGaps(trips: Trip[], monthStart: Date, effectiveEnd: Date): GapInterval[] {
  // Clip each trip to [monthStart, effectiveEnd]
  const intervals = trips
    .map(t => ({
      from: parseDate(t.start_date) > monthStart ? parseDate(t.start_date) : monthStart,
      to: (t.end_date ? parseDate(t.end_date) : new Date()) < effectiveEnd
        ? (t.end_date ? parseDate(t.end_date) : new Date())
        : effectiveEnd,
    }))
    .filter(({ from, to }) => from <= to)
    .sort((a, b) => a.from.getTime() - b.from.getTime());

  if (intervals.length === 0) {
    const days = Math.floor((effectiveEnd.getTime() - monthStart.getTime()) / 86_400_000) + 1;
    return days > 0 ? [{ from: monthStart, to: effectiveEnd, days }] : [];
  }

  // Merge overlapping/adjacent intervals
  const merged: { from: Date; to: Date }[] = [{ ...intervals[0] }];
  for (const curr of intervals.slice(1)) {
    const last = merged[merged.length - 1];
    if (curr.from.getTime() <= last.to.getTime() + 86_400_000) {
      if (curr.to > last.to) last.to = curr.to;
    } else {
      merged.push({ ...curr });
    }
  }

  const gaps: GapInterval[] = [];
  const addGap = (from: Date, to: Date) => {
    const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (days > 0) gaps.push({ from, to, days });
  };

  if (merged[0].from > monthStart)
    addGap(monthStart, new Date(merged[0].from.getTime() - 86_400_000));

  for (let i = 0; i < merged.length - 1; i++)
    addGap(new Date(merged[i].to.getTime() + 86_400_000), new Date(merged[i + 1].from.getTime() - 86_400_000));

  if (merged[merged.length - 1].to < effectiveEnd)
    addGap(new Date(merged[merged.length - 1].to.getTime() + 86_400_000), effectiveEnd);

  return gaps;
}

// ─── Types ───

interface Section {
  title: string;
  data: { trip: Trip; daysInMonth: number }[];
  totalDays: number;
  hasOverlap: boolean;
  gaps: GapInterval[];
  monthStart: Date;
  monthEnd: Date;
}

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ─── Component ───

export default function TimelineScreen() {
  const router = useRouter();
  const { trips, loading, refresh } = useTrips();
  const [refreshing, setRefreshing] = useState(false);

  // Inline unlock overlay state — avoids pushing a modal route while a form
  // sheet is animating away (which triggers RNScreens' sheetPresentationController
  // detents warning).
  const [unlockCode, setUnlockCode] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const t = setTimeout(async () => {
        const code = await takePendingUnlock();
        if (cancelled || !code) return;
        setUnlockCode(code);
      }, 450);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }, []),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const [result] = await Promise.all([
      refresh(),
      new Promise((r) => setTimeout(r, 800)),
    ]);
    setRefreshing(false);
  }, [refresh]);

  // ─── Overlap detection (global across all trips) ───

  const overlappingTripIds = useMemo(() => {
    const ids = new Set<number>();
    for (let i = 0; i < trips.length; i++) {
      for (let j = i + 1; j < trips.length; j++) {
        const a = trips[i];
        const b = trips[j];
        const aStart = parseDate(a.start_date).getTime();
        const aEnd = a.end_date ? parseDate(a.end_date).getTime() : Date.now();
        const bStart = parseDate(b.start_date).getTime();
        const bEnd = b.end_date ? parseDate(b.end_date).getTime() : Date.now();
        if (aStart < bEnd && bStart < aEnd) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
    }
    return ids;
  }, [trips]);

  // ─── Sections ───

  const sections = useMemo<Section[]>(() => {
    const grouped = new Map<string, {
      title: string;
      monthStart: Date;
      monthEnd: Date;
      data: Trip[];
    }>();

    for (const trip of trips) {
      const tripStart = parseDate(trip.start_date);
      const tripEnd = trip.end_date ? parseDate(trip.end_date) : new Date();

      const cursor = new Date(tripStart.getFullYear(), tripStart.getMonth(), 1);
      const lastMonth = new Date(tripEnd.getFullYear(), tripEnd.getMonth(), 1);

      while (cursor <= lastMonth) {
        const sortKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        if (!grouped.has(sortKey)) {
          grouped.set(sortKey, {
            title: cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            monthStart: new Date(cursor.getFullYear(), cursor.getMonth(), 1),
            monthEnd: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0),
            data: [],
          });
        }
        grouped.get(sortKey)!.data.push(trip);
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, { title, data, monthStart, monthEnd }]) => {
        const daysInCalendarMonth = monthEnd.getDate();

        // Per-trip days clipped to this month
        let totalDays = 0;
        const dataWithDays = data.map((trip) => {
          const tripStart = parseDate(trip.start_date);
          const tripEnd = trip.end_date ? parseDate(trip.end_date) : new Date();
          const from = tripStart > monthStart ? tripStart : monthStart;
          const to = tripEnd < monthEnd ? tripEnd : monthEnd;
          const daysInMonth = from > to ? 0 : Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
          totalDays += daysInMonth;
          return { trip, daysInMonth };
        });

        // Compute covered days via merged intervals (travel-day boundaries not double-counted)
        const clipped = data
          .map(trip => ({
            from: parseDate(trip.start_date) > monthStart ? parseDate(trip.start_date) : monthStart,
            to: (trip.end_date ? parseDate(trip.end_date) : new Date()) < monthEnd
              ? (trip.end_date ? parseDate(trip.end_date) : new Date())
              : monthEnd,
          }))
          .filter(({ from, to }) => from <= to)
          .sort((a, b) => a.from.getTime() - b.from.getTime());

        const mergedCoverage: { from: Date; to: Date }[] = [];
        for (const curr of clipped) {
          const last = mergedCoverage[mergedCoverage.length - 1];
          if (last && curr.from.getTime() <= last.to.getTime() + 86_400_000) {
            if (curr.to > last.to) last.to = curr.to;
          } else {
            mergedCoverage.push({ ...curr });
          }
        }
        const coveredDays = mergedCoverage.reduce(
          (sum, { from, to }) => sum + Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1, 0
        );

        // hasOverlap: same strict condition as overlappingTripIds (travel-day boundaries excluded)
        const hasOverlap = data.some((a, i) =>
          data.slice(i + 1).some(b => {
            const aStart = parseDate(a.start_date);
            const aEnd = a.end_date ? parseDate(a.end_date) : new Date();
            const bStart = parseDate(b.start_date);
            const bEnd = b.end_date ? parseDate(b.end_date) : new Date();
            return aStart < bEnd && bStart < aEnd;
          })
        );
        const cappedDays = Math.min(coveredDays, daysInCalendarMonth);

        // Compute actual gaps using merge algorithm
        const today = new Date(); today.setHours(23, 59, 59, 999);
        const effectiveEnd = monthEnd < today ? monthEnd : today;
        const gaps = computeGaps(data, monthStart, effectiveEnd);

        return { title, data: dataWithDays, totalDays: cappedDays, hasOverlap, gaps, monthStart, monthEnd };
      });
  }, [trips]);

  // ─── Navigation ───

  const openSheet = useCallback((prefillStart?: Date, prefillEnd?: Date) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: './create/country',
      params: {
        ...(prefillStart && { start: fmt(prefillStart) }),
        ...(prefillEnd && { end: fmt(prefillEnd) }),
      },
    });
  }, [router]);

  const openImport = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await pickImportImages();
    if (!result.ok) {
      if (result.reason === 'no-permission') {
        Alert.alert('Photo Access Needed', 'Please allow photo access to import screenshots.');
      } else if (result.reason === 'empty') {
        Alert.alert('Nothing imported', 'Could not read the selected images.');
      }
      return;
    }
    setPendingImportImages(result.images);
    router.push('./import');
  }, [router]);

  const openEditSheet = useCallback((trip: Trip) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: './create/country',
      params: {
        id: String(trip.id),
        country: trip.country,
        city: trip.city,
        start: trip.start_date,
        ...(trip.end_date && { end: trip.end_date }),
        noEnd: trip.end_date ? '0' : '1',
      },
    });
  }, [router]);

  const handleDelete = useCallback(async (id: number) => {
    await markTripDeleted(id);
    refresh();
  }, [refresh]);

  // ─── Header ───

  const headerRight = useCallback(
    () => {
      if (Platform.OS !== 'ios') {
        return (
          <Pressable onPress={() => openSheet()} hitSlop={8}>
            <Ionicons name="add" size={28} color={Colors.primary} />
          </Pressable>
        );
      }
      return (
        <Host matchContents>
          <Menu label={<ExpoUIImage systemName="plus" size={18} color="#000000" />}>
            <ExpoUIButton
              label="Add trip manually"
              systemImage="square.and.pencil"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                openSheet();
              }}
            />
            <ExpoUIButton
              label="Import from screenshots"
              systemImage="photo.on.rectangle"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                openImport();
              }}
            />
          </Menu>
        </Host>
      );
    },
    [openSheet, openImport],
  );

  // ─── Main content ───

  const PillShell = hasGlass ? GlassView : View;

  const renderContent = () => {
    if (loading) return null;
    if (!loading && trips.length === 0) {
      return <TimelineEmpty onAdd={() => openSheet()} onImport={openImport} />;
    }
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* One continuous line behind everything */}
        <View style={styles.timelineLine}>
          <LinearGradient
            colors={['transparent', Colors.primary + '30', Colors.primary + '30', 'transparent']}
            locations={[0, 0.02, 0.98, 1]}
            style={{ flex: 1 }}
          />
        </View>

        {sections.map((section) => (
          <View key={section.title}>
            {/* Section header */}
            <View style={styles.sectionHeader}>
              <View style={styles.sectionLineCol} />
              <PillShell
                {...(hasGlass
                  ? { glassEffectStyle: 'regular' as const, style: styles.sectionPill }
                  : { style: [styles.sectionPill, styles.sectionPillFallback] })}
              >
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </PillShell>
              <View style={styles.sectionStats}>
                <Text style={styles.sectionStatValue}>{section.data.length}</Text>
                <Text style={styles.sectionStatLabel}>{section.data.length === 1 ? 'trip' : 'trips'}</Text>
                <Text style={styles.sectionStatSep}>·</Text>
                <Text style={styles.sectionStatValue}>{section.totalDays}</Text>
                <Text style={styles.sectionStatLabel}>days</Text>
                {section.hasOverlap && (
                  <View style={styles.warningBadge}>
                    <Text style={styles.warningBadgeText}>overlap</Text>
                  </View>
                )}
                {!section.hasOverlap && section.gaps.length > 0 && (
                  <View style={styles.gapBadge}>
                    <Text style={styles.gapBadgeText}>
                      {section.gaps.reduce((s, g) => s + g.days, 0)}d gap
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Trip cards — grouped by consecutive same-country runs */}
            {(() => {
              const sorted = [...section.data].sort(
                (a, b) => parseDate(b.trip.start_date).getTime() - parseDate(a.trip.start_date).getTime(),
              );
              const grouped = groupByCountryRuns(sorted);
              return grouped.map((item, idx) => {
                if (isCountryGroup(item)) {
                  return (
                    <CountryGroupCard
                      key={`grp-${item.countryCode}-${section.title}-${idx}`}
                      group={item}
                      overlappingTripIds={overlappingTripIds}
                      onDelete={handleDelete}
                      onEdit={openEditSheet}
                    />
                  );
                }
                const { trip, daysInMonth } = item;
                return (
                  <TripCard
                    key={`${trip.id}-${section.title}`}
                    trip={trip}
                    daysOverride={daysInMonth}
                    hasOverlap={overlappingTripIds.has(trip.id)}
                    onDelete={handleDelete}
                    onEdit={openEditSheet}
                  />
                );
              });
            })()}

            {/* Gap indicators — sorted newest first to match card order */}
            {[...section.gaps]
              .sort((a, b) => b.from.getTime() - a.from.getTime())
              .map((gap) => (
                <GapIndicator
                  key={`gap-${section.title}-${gap.from.toISOString()}`}
                  fromDate={gap.from}
                  toDate={gap.to}
                  days={gap.days}
                  onAdd={(from, to) => openSheet(from, to)}
                />
              ))}
          </View>
        ))}
      </ScrollView>
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerRight }} />
      {renderContent()}
      {unlockCode && (
        <BadgeUnlockOverlay
          countryCode={unlockCode}
          onClose={() => setUnlockCode(null)}
        />
      )}
    </>
  );
}

// ─── Styles ───

const styles = StyleSheet.create({
  content: {
    paddingBottom: 100,
    paddingLeft: 16,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 16 + 28 / 2 - 1, // paddingLeft + half timeline col - half line width
    width: 2,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 16,
  },
  sectionLineCol: {
    width: 28,
  },
  sectionPill: {
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  sectionPillFallback: {
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  sectionStats: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    marginLeft: 10,
  },
  sectionStatValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  sectionStatLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
    opacity: 0.7,
  },
  sectionStatSep: {
    fontSize: 12,
    color: Colors.border,
    marginHorizontal: 1,
  },
  warningBadge: {
    backgroundColor: '#FF3B3015',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
  },
  warningBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FF3B30',
  },
  gapBadge: {
    backgroundColor: '#FF950015',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
  },
  gapBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FF9500',
  },
});
