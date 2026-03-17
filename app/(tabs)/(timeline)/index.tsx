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
import DateTimePicker from '@react-native-community/datetimepicker';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useTrips } from '../../../hooks/useTrips';
import { TripCard } from '../../../components/TripCard';
import { EmptyState } from '../../../components/EmptyState';
import { SheetLayer, SheetBackdrop } from '../../../components/IslandSheet';
import { Colors } from '../../../constants/colors';
import { Trip, insertTripManual } from '../../../lib/database';
import { forwardGeocode } from '../../../lib/geocoding';
import { getPopularCountries, searchCountries, getCitiesByCountryPaginated, searchCitiesByCountry, getCountryCode, getCountryFlag } from '../../../utils/geography';

const hasGlass = isLiquidGlassAvailable();

// ─── Types ───

interface Section {
  title: string;
  data: Trip[];
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
  const [saving, setSaving] = useState(false);

  // ─── Sections ───

  const sections = useMemo<Section[]>(() => {
    const grouped: Record<string, Trip[]> = {};
    for (const trip of trips) {
      const date = new Date(trip.start_date);
      const key = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(trip);
    }
    return Object.entries(grouped).map(([title, data]) => ({ title, data }));
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

  const openSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedCountry('');
    setSelectedCity('');
    setStartDate(new Date());
    setEndDate(new Date());
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

  const handleSave = useCallback(async () => {
    if (endDate < startDate) {
      Alert.alert('Invalid dates', 'End date must be after start date.');
      return;
    }
    setSaving(true);
    try {
      const code = getCountryCode(selectedCountry);
      const s = startDate.toISOString().split('T')[0];
      const e = endDate.toISOString().split('T')[0];
      const coords = await forwardGeocode(`${selectedCity}, ${selectedCountry}`);
      await insertTripManual(selectedCity, selectedCountry, code, s, e, coords?.latitude, coords?.longitude);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep('closed');
      refresh();
    } catch (err) {
      console.error('Failed to save trip:', err);
      Alert.alert('Error', 'Failed to save trip.');
    } finally {
      setSaving(false);
    }
  }, [selectedCountry, selectedCity, startDate, endDate, refresh]);

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
      <Pressable onPress={openSheet} hitSlop={8}>
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
            </View>

            {/* Trip cards */}
            {section.data.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
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
            title="Choose Country"
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
            title="Trip Dates"
            snapPoint={0.38}
            depth={0}
          >
            <View style={styles.datesContainer}>
              <View style={styles.dateSummary}>
                <Text style={styles.dateSummaryLabel}>
                  {selectedCity}, {selectedCountry}
                </Text>
              </View>

              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <Text style={styles.dateLabel}>Start</Text>
                  <DateTimePicker
                    value={startDate}
                    mode="date"
                    display="compact"
                    onChange={(_, d) => d && setStartDate(d)}
                  />
                </View>
                <View style={styles.dateField}>
                  <Text style={styles.dateLabel}>End</Text>
                  <DateTimePicker
                    value={endDate}
                    mode="date"
                    display="compact"
                    minimumDate={startDate}
                    onChange={(_, d) => d && setEndDate(d)}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSave}
                activeOpacity={0.8}
                disabled={saving}
              >
                <Text style={styles.saveButtonText}>
                  {saving ? 'Saving...' : 'Save Trip'}
                </Text>
              </TouchableOpacity>
            </View>
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
