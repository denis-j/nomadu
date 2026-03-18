import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTrips } from '../../../hooks/useTrips';
import { TripCard } from '../../../components/TripCard';
import { EmptyState } from '../../../components/EmptyState';
import { SheetLayer, SheetBackdrop } from '../../../components/IslandSheet';
import { Colors } from '../../../constants/colors';
import { Trip, insertTripManual, updateTrip, markTripDeleted, parseDate } from '../../../lib/database';
import { forwardGeocode } from '../../../lib/geocoding';
import { getPopularCountries, searchCountries, getCitiesByCountryPaginated, searchCitiesByCountry, getCountryCode, getCountryFlag } from '../../../utils/geography';

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

type SheetStep = 'closed' | 'country' | 'city' | 'dates';

// ─── Precomputed ───

const popularCountries = getPopularCountries();

// ─── Component ───

export default function TimelineScreen() {
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

  const [step, setStep] = useState<SheetStep>('closed');
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [noEndDate, setNoEndDate] = useState(false);
  const [startPickerKey, setStartPickerKey] = useState(0);
  const [endPickerKey, setEndPickerKey] = useState(0);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [saving, setSaving] = useState(false);

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

  // ─── Sheet flow ───

  const closeAll = useCallback(() => {
    if (closing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setClosing(true);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setStep('closed');
      setClosing(false);
    }, 350);
  }, [closing]);

  const handleDelete = useCallback(async (id: number) => {
    await markTripDeleted(id);
    refresh();
  }, [refresh]);

  const openSheet = useCallback((prefillStart?: Date, prefillEnd?: Date) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditingTrip(null);
    setSelectedCountry('');
    setSelectedCity('');
    setStartDate(prefillStart ?? new Date());
    setEndDate(prefillEnd ?? new Date());
    setNoEndDate(false);
    setStartPickerKey(0);
    setEndPickerKey(0);
    setSaving(false);
    setStep('country');
  }, []);

  const openEditSheet = useCallback((trip: Trip) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditingTrip(trip);
    setSelectedCountry(trip.country);
    setSelectedCity(trip.city);
    setStartDate(parseDate(trip.start_date));
    setEndDate(trip.end_date ? parseDate(trip.end_date) : new Date());
    setNoEndDate(!trip.end_date);
    setStartPickerKey(0);
    setEndPickerKey(0);
    setSaving(false);
    setStep('country');
  }, []);

  const pickCountry = useCallback((name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCountry(name);
    setStep('city');
  }, []);

  const pickCity = useCallback((name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCity(name);
    setStep('dates');
  }, []);

  const saveWith = useCallback(async (start: Date, end: Date | null) => {
    setSaving(true);
    try {
      const code = getCountryCode(selectedCountry);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const s = fmt(start);
      const e = end ? fmt(end) : null;
      const coords = await forwardGeocode(`${selectedCity}, ${selectedCountry}`);
      if (editingTrip) {
        await updateTrip(editingTrip.id, selectedCity, selectedCountry, code, s, e, coords?.latitude, coords?.longitude);
      } else {
        await insertTripManual(selectedCity, selectedCountry, code, s, e, coords?.latitude, coords?.longitude);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep('closed');
      refresh();
    } catch (err) {
      console.error('Failed to save trip:', err);
    } finally {
      setSaving(false);
    }
  }, [selectedCountry, selectedCity, editingTrip, refresh]);

  const handleSave = useCallback(() => saveWith(startDate, noEndDate ? null : endDate),
    [saveWith, startDate, endDate, noEndDate]);

  // ─── Depth ───

  const countryDepth = step === 'country' ? 0 : step === 'city' ? 1 : step === 'dates' ? 2 : 0;
  const cityDepth = step === 'city' ? 0 : step === 'dates' ? 1 : 0;

  const modalOpen = step !== 'closed' || closing;
  const countryVisible = !closing && (step === 'country' || step === 'city' || step === 'dates');
  const cityVisible = !closing && (step === 'city' || step === 'dates');
  const datesVisible = !closing && step === 'dates';

  // ─── Cities ─---

  const [cities, setCities] = useState<string[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesHasMore, setCitiesHasMore] = useState(false);
  const [citiesPage, setCitiesPage] = useState(1);
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [citySearchResults, setCitySearchResults] = useState<string[] | null>(null);
  const [citySearchLoading, setCitySearchLoading] = useState(false);

  useEffect(() => {
    if (!selectedCountry) {
      setCities([]);
      return;
    }
    setCitiesPage(1);
    setCitySearchQuery('');
    setCitySearchResults(null);
    setCitiesLoading(true);
    getCitiesByCountryPaginated(selectedCountry, 1, 30).then((result) => {
      setCities(result.cities);
      setCitiesHasMore(result.hasMore);
      setCitiesLoading(false);
    });
  }, [selectedCountry]);

  const handleCitySearch = useCallback((query: string) => {
    setCitySearchQuery(query);
    if (!query.trim()) {
      setCitySearchResults(null);
      setCitySearchLoading(false);
      return;
    }
    setCitySearchLoading(true);
    searchCitiesByCountry(selectedCountry, query).then((results) => {
      setCitySearchResults(results);
      setCitySearchLoading(false);
    });
  }, [selectedCountry]);

  const loadMoreCities = useCallback(() => {
    if (citiesLoading || !citiesHasMore) return;
    setCitiesLoading(true);
    const nextPage = citiesPage + 1;
    getCitiesByCountryPaginated(selectedCountry, nextPage, 30).then((result) => {
      setCities((prev) => [...prev, ...result.cities]);
      setCitiesHasMore(result.hasMore);
      setCitiesPage(nextPage);
      setCitiesLoading(false);
    });
  }, [selectedCountry, citiesPage, citiesLoading, citiesHasMore]);

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

      {/* ── Inline sheet layers (no Modal for instant open) ── */}
      {modalOpen && (
        <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <SheetBackdrop visible={modalOpen && !closing} onPress={closeAll} />

          {/* Layer 1: Country */}
          <SheetLayer
            visible={countryVisible}
            onClose={closeAll}
            title={editingTrip ? 'Edit Country' : 'Choose Country'}
            searchEnabled
            searchPlaceholder="Search countries..."
            snapPoint={0.5}
            depth={countryDepth}
          >
            {(query: string) => {
              const filtered = query.trim()
                ? searchCountries(query)
                : popularCountries;
              const showingPopular = !query.trim();
              return (
                <View style={styles.listContainer}>
                  {showingPopular && (
                    <Text style={styles.listSectionLabel}>Popular</Text>
                  )}
                  {filtered.map((name) => {
                    const flag = getCountryFlag(name);
                    return (
                      <TouchableOpacity
                        key={name}
                        style={styles.listItem}
                        onPress={() => pickCountry(name)}
                        activeOpacity={0.6}
                      >
                        {flag && <Text style={styles.listItemIcon}>{flag}</Text>}
                        <Text style={styles.listItemText}>{name}</Text>
                        <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                      </TouchableOpacity>
                    );
                  })}
                  {filtered.length === 0 && (
                    <Text style={styles.emptyText}>No countries found</Text>
                  )}
                </View>
              );
            }}
          </SheetLayer>

          {/* Layer 2: City */}
          <SheetLayer
            visible={cityVisible}
            onClose={closeAll}
            onBack={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setStep('country');
            }}
            title={selectedCountry}
            searchEnabled
            searchPlaceholder="Search cities..."
            onSearchChange={handleCitySearch}
            snapPoint={0.48}
            depth={cityDepth}
          >
            {(query: string) => {
              if (citiesLoading) {
                return (
                  <View style={styles.listContainer}>
                    <Text style={styles.emptyText}>Loading cities...</Text>
                  </View>
                );
              }
              const displayCities = citySearchResults ?? cities;
              const isSearching = citySearchQuery.trim() !== '' && citySearchLoading;

              return (
                <View style={styles.listContainer}>
                  {isSearching && (
                    <Text style={styles.emptyText}>Searching...</Text>
                  )}
                  {!isSearching && displayCities.map((name: string, index: number) => (
                    <TouchableOpacity
                      key={`${name}-${index}`}
                      style={styles.listItem}
                      onPress={() => pickCity(name)}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.listItemText}>{name}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                    </TouchableOpacity>
                  ))}
                  {!isSearching && !citySearchQuery && citiesHasMore && (
                    <TouchableOpacity
                      style={styles.loadMoreButton}
                      onPress={loadMoreCities}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.loadMoreText}>
                        {citiesLoading ? 'Loading...' : 'Load more'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {displayCities.length === 0 && !isSearching && (
                    <Text style={styles.emptyText}>No cities found</Text>
                  )}
                </View>
              );
            }}
          </SheetLayer>

          {/* Layer 3: Dates + Save */}
          <SheetLayer
            visible={datesVisible}
            onClose={closeAll}
            onBack={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setStep('city');
            }}
            title={editingTrip ? 'Edit Dates' : 'Trip Dates'}
            snapPoint={0.52}
            depth={0}
          >
            {(() => {
              const days = noEndDate
                ? Math.max(1, Math.round((new Date().getTime() - startDate.getTime()) / 86_400_000) + 1)
                : Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);

              return (
                <View style={styles.datesContainer}>
                  {/* Location + day count */}
                  <View style={styles.datesSummaryRow}>
                    <Text style={styles.dateSummaryLabel}>{selectedCity}, {selectedCountry}</Text>
                    <View style={styles.rangeDaysBubble}>
                      <Text style={styles.rangeDaysText}>{days}d</Text>
                    </View>
                  </View>

                  {/* FROM / TO pickers */}
                  <View style={styles.dateRow}>
                    <View style={styles.dateField}>
                      <Text style={styles.dateLabel}>From</Text>
                      <DateTimePicker
                        key={startPickerKey}
                        value={startDate}
                        mode="date"
                        display="compact"
                        maximumDate={noEndDate ? new Date() : endDate}
                        onChange={(_, d) => {
                          if (!d) return;
                          setStartDate(d);
                          setStartPickerKey(k => k + 1);
                        }}
                      />
                    </View>
                    {!noEndDate && (
                      <View style={styles.dateField}>
                        <Text style={styles.dateLabel}>To</Text>
                        <DateTimePicker
                          key={endPickerKey}
                          value={endDate}
                          mode="date"
                          display="compact"
                          minimumDate={startDate}
                          maximumDate={new Date()}
                          onChange={(_, d) => {
                            if (!d) return;
                            setEndDate(d);
                            setEndPickerKey(k => k + 1);
                          }}
                        />
                      </View>
                    )}
                  </View>

                  {/* Still traveling toggle */}
                  <TouchableOpacity
                    style={styles.toggleRow}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setNoEndDate(v => !v);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.toggle, noEndDate && styles.toggleActive]}>
                      <View style={[styles.toggleThumb, noEndDate && styles.toggleThumbActive]} />
                    </View>
                    <Text style={styles.toggleLabel}>Still traveling</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                    onPress={handleSave}
                    activeOpacity={0.8}
                    disabled={saving}
                  >
                    <Text style={styles.saveButtonText}>
                      {saving ? 'Saving...' : editingTrip ? 'Update Trip' : 'Save Trip'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })()}
          </SheetLayer>
        </GestureHandlerRootView>
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
  listContainer: {
    paddingHorizontal: 4,
    paddingBottom: 20,
  },
  listSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  listItemIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  listItemText: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  emptyText: {
    textAlign: 'center',
    color: '#8E8E93',
    fontSize: 15,
    paddingVertical: 32,
  },
  loadMoreButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  loadMoreText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  datesContainer: {
    padding: 20,
    gap: 20,
  },
  dateSummary: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  dateSummaryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateField: {
    flex: 1,
    gap: 6,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // ─── Dates modal ───
  datesSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rangeDaysBubble: {
    backgroundColor: Colors.primary + '18',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rangeDaysText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  rangeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rangeStripDate: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  rangeStripLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  // ─── Start/End segment ───
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  segmentBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  segmentBtnLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  segmentBtnDate: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  segmentBtnDateActive: {
    color: Colors.primary,
  },
  segmentArrow: {
    paddingHorizontal: 4,
  },
  // ─── Toggle ───
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E5E5EA',
    padding: 3,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: Colors.primary,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  toggleThumbActive: {
    transform: [{ translateX: 18 }],
  },
  toggleLabel: {
    fontSize: 15,
    color: Colors.text,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
