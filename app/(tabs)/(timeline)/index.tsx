import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTrips } from '../../../hooks/useTrips';
import { TripCard } from '../../../components/TripCard';
import { EmptyState } from '../../../components/EmptyState';
import { Colors } from '../../../constants/colors';
import { Trip, markTripDeleted, parseDate } from '../../../lib/database';

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
    () => (
      <Pressable onPress={() => openSheet()} hitSlop={8}>
        <Ionicons name="add" size={28} color={Colors.primary} />
      </Pressable>
    ),
    [openSheet],
  );

  // ─── Main content ───

  const PillShell = hasGlass ? GlassView : View;

  const renderContent = () => {
    if (loading) return null;
    if (!loading && trips.length === 0) {
      return (
        <EmptyState
          icon="🪰"
          title="No trips yet"
          subtitle="Your travels will appear here as a timeline once tracking begins."
        />
      );
    }
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* One continuous line behind everything */}
        <View style={styles.timelineLine} />

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

            {/* Trip cards */}
            {[...section.data]
              .sort((a, b) => parseDate(b.trip.start_date).getTime() - parseDate(a.trip.start_date).getTime())
              .map(({ trip, daysInMonth }) => (
                <TripCard
                  key={`${trip.id}-${section.title}`}
                  trip={trip}
                  daysOverride={daysInMonth}
                  hasOverlap={overlappingTripIds.has(trip.id)}
                  onDelete={handleDelete}
                  onEdit={openEditSheet}
                />
              ))}

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
    backgroundColor: Colors.primary + '30',
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
