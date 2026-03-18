import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring,
  interpolate, Easing,
} from 'react-native-reanimated';
import {
  ActionSheetIOS,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import RNMapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useJourney } from '../../../hooks/useJourney';
import { useAuth } from '../../../hooks/useAuth';
import { EmptyState } from '../../../components/EmptyState';
import { SheetBackdrop, SheetLayer } from '../../../components/IslandSheet';
import { Colors } from '../../../constants/colors';
import {
  JourneyLeg, TransportType,
  deleteJourneyLeg, insertJourneyLeg, parseDate, updateJourneyLeg,
  getAllTripsRaw,
} from '../../../lib/database';
import { getCitizenship, getHasFixedResidence } from '../../../lib/onboarding';
import { calculateAllVisaStatuses, VisaStatus } from '../../../lib/visaCalculations';
import { calculateAllTaxStatuses, TaxStatus } from '../../../lib/taxCalculations';
import { SCHENGEN_COUNTRIES, DEFAULT_VISA_RULES } from '../../../constants/visaRules';
import { forwardGeocode, countryCodeToFlag } from '../../../lib/geocoding';
import {
  getPopularCountries, searchCountries, getCitiesByCountryPaginated,
  searchCitiesByCountry, getCountryCode, getCountryFlag,
} from '../../../utils/geography';
import { suggestNextStops, getCityTips, StopSuggestion } from '../../../lib/ai';
import AsyncStorage from '@react-native-async-storage/async-storage';

const hasGlass = isLiquidGlassAvailable();

// ─── Transport config ─────────────────────────────────────────────────────────

const TRANSPORTS: { type: TransportType; icon: string; label: string }[] = [
  { type: 'flight', icon: 'airplane',      label: 'Flight' },
  { type: 'train',  icon: 'train-outline', label: 'Train'  },
  { type: 'car',    icon: 'car-outline',   label: 'Car'    },
  { type: 'bus',    icon: 'bus-outline',   label: 'Bus'    },
  { type: 'ferry',  icon: 'boat-outline',  label: 'Ferry'  },
  { type: 'walk',   icon: 'walk-outline',  label: 'Walk'   },
];

function transportIcon(t: TransportType): string {
  return TRANSPORTS.find((x) => x.type === t)?.icon ?? 'airplane';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtShort(dateStr: string): string {
  const d = parseDate(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function legDays(start: string, end: string): number {
  const s = parseDate(start);
  const e = parseDate(end);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1);
}

// ─── Journey Map Card ─────────────────────────────────────────────────────────

function JourneyMapCard({ legs, headerHeight }: { legs: JourneyLeg[]; headerHeight: number }) {
  const coordLegs = useMemo(
    () => legs.filter((l) => l.latitude != null && l.longitude != null),
    [legs],
  );

  const region = useMemo(() => {
    if (coordLegs.length === 0) return null;
    const lats = coordLegs.map((l) => l.latitude as number);
    const lngs = coordLegs.map((l) => l.longitude as number);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const pad = 0.3;
    const latDelta = Math.max(8, (maxLat - minLat) * (1 + pad));
    const lngDelta = Math.max(8, (maxLng - minLng) * (1 + pad));
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [coordLegs]);

  if (coordLegs.length === 0 || !region) return null;

  const polyCoords = coordLegs.map((l) => ({
    latitude: l.latitude as number,
    longitude: l.longitude as number,
  }));

  return (
    <View style={[styles.mapCard, { marginTop: -headerHeight }]}>
      <RNMapView
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        region={region}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        mapType="standard"
      >
        {coordLegs.length > 1 && (
          <Polyline
            coordinates={polyCoords}
            strokeColor={Colors.primary}
            strokeWidth={2}
            lineDashPattern={[6, 4]}
          />
        )}
        {coordLegs.map((leg) => (
          <Marker
            key={leg.id}
            coordinate={{ latitude: leg.latitude as number, longitude: leg.longitude as number }}
            title={leg.city}
          />
        ))}
      </RNMapView>
    </View>
  );
}

// ─── Leg Card ─────────────────────────────────────────────────────────────────

function visaChipColor(status: VisaStatus['status']) {
  if (status === 'exceeded') return Colors.error;
  if (status === 'critical') return Colors.error;
  if (status === 'warning') return Colors.warning;
  return Colors.success;
}

function taxChipColor(status: TaxStatus['status']) {
  if (status === 'resident') return Colors.error;
  if (status === 'warning') return Colors.error;
  return Colors.warning; // caution
}

function LegCard({
  leg,
  prevCity,
  isFirst,
  onEdit,
  onDelete,
  visaStatuses,
  taxStatuses,
}: {
  leg: JourneyLeg;
  prevCity: string | null;
  isFirst: boolean;
  onEdit: (leg: JourneyLeg) => void;
  onDelete: (id: number) => void;
  visaStatuses: VisaStatus[];
  taxStatuses: TaxStatus[];
}) {
  const flag = countryCodeToFlag(leg.country_code);
  const days = legDays(leg.start_date, leg.end_date);

  const isSchengen = !!leg.country_code && (SCHENGEN_COUNTRIES as readonly string[]).includes(leg.country_code);

  // ── Tracked-trip context (current historical usage) ──────────────────────────
  const trackedVisa = !leg.country_code ? undefined : isSchengen
    ? visaStatuses.find((v) => v.destinationCode === 'SCHENGEN')
    : visaStatuses.find((v) => v.destinationCode === leg.country_code);
  const trackedTax = !leg.country_code ? undefined : taxStatuses.find(
    (t) => t.countryCode === leg.country_code && t.status !== 'safe',
  );

  // ── Planned-leg projection (works even without any tracked trips) ─────────────
  const TAX_THRESHOLD = 183;
  const plannedDays = days; // already calculated above

  // Visa: check against known rule or Schengen 90-day limit
  const visaRule = leg.country_code ? DEFAULT_VISA_RULES[leg.country_code] : undefined;
  const visaLimit = isSchengen ? 90 : visaRule?.allowedDays;
  const plannedVisaExceeds = visaLimit !== undefined && plannedDays > visaLimit;

  // Tax: any stay ≥ 183 days is a risk
  const plannedTaxExceeds = plannedDays >= TAX_THRESHOLD;

  // ── Build chips ───────────────────────────────────────────────────────────────
  interface Chip { label: string; color: string }
  const chips: Chip[] = [];

  if (trackedVisa) {
    // Show actual remaining days from tracked history
    const color = visaChipColor(trackedVisa.status);
    const label = isSchengen
      ? `🇪🇺 ${trackedVisa.daysRemaining}d Schengen left`
      : `${flag} ${trackedVisa.daysRemaining}d visa left`;
    chips.push({ label, color });
  } else if (plannedVisaExceeds) {
    // No tracked data but this leg alone exceeds the limit
    const label = isSchengen
      ? `🇪🇺 ${plannedDays}d > ${visaLimit}d Schengen`
      : `${flag} ${plannedDays}d > ${visaLimit}d visa`;
    chips.push({ label, color: Colors.error });
  }

  if (trackedTax) {
    const color = taxChipColor(trackedTax.status);
    chips.push({ label: `⚠︎ ${trackedTax.daysPresent}/${trackedTax.thresholdDays}d tax`, color });
  } else if (plannedTaxExceeds && !trackedVisa) {
    // Only show projected tax if not already covered by tracked data
    chips.push({ label: `⚠︎ ${plannedDays}d > ${TAX_THRESHOLD}d tax risk`, color: Colors.error });
  }

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Edit', 'Delete', 'Cancel'],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
      },
      (i) => {
        if (i === 0) onEdit(leg);
        if (i === 1) onDelete(leg.id);
      },
    );
  };

  const CardWrap = hasGlass ? GlassView : View;
  const cardProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

  return (
    <View style={styles.legWrapper}>
      {/* Connector between legs */}
      {!isFirst && (
        <View style={styles.connector}>
          <View style={styles.dotCol} />
          <View style={styles.connectorBadge}>
            <Ionicons
              name={transportIcon(leg.transport) as any}
              size={13}
              color={Colors.textSecondary}
            />
            {prevCity ? (
              <Text style={styles.connectorText} numberOfLines={1}>
                from {prevCity}
              </Text>
            ) : null}
          </View>
        </View>
      )}

      {/* Leg row: dot col + card */}
      <TouchableOpacity onLongPress={handleLongPress} activeOpacity={0.85}>
        <View style={styles.legRow}>
          <View style={styles.dotCol}>
            <View style={styles.dot} />
          </View>
          <CardWrap {...cardProps} style={[styles.legCard, !hasGlass && styles.legCardFallback]}>
            {/* Flag */}
            <Text style={styles.legFlag}>{flag}</Text>

            {/* Center info */}
            <View style={styles.legCenter}>
              <Text style={styles.legCity}>{leg.city}</Text>
              <Text style={styles.legCountry}>{leg.country}</Text>
              <Text style={styles.legDates}>
                {fmtShort(leg.start_date)} – {fmtShort(leg.end_date)}
              </Text>
              {leg.notes ? (
                <Text style={styles.legNotes} numberOfLines={2}>{leg.notes}</Text>
              ) : null}
              {chips.length > 0 && (
                <View style={styles.statusChipsRow}>
                  {chips.map((chip, i) => (
                    <View key={i} style={[styles.statusChip, { backgroundColor: chip.color + '18' }]}>
                      <Text style={[styles.statusChipText, { color: chip.color }]}>{chip.label}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Right badges */}
            <View style={styles.legRight}>
              <View style={styles.daysBadge}>
                <Text style={styles.daysText}>{days}d</Text>
              </View>
              <View style={styles.transportBadge}>
                <Ionicons
                  name={transportIcon(leg.transport) as any}
                  size={14}
                  color={Colors.primary}
                />
              </View>
            </View>
          </CardWrap>
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── Suggestion Leg Card ──────────────────────────────────────────────────────

function SuggestionLegCard({
  suggestion,
  onAdd,
}: {
  suggestion: StopSuggestion;
  onAdd: () => void;
}) {
  const flag = countryCodeToFlag(getCountryCode(suggestion.country));
  const days = legDays(suggestion.startDate, suggestion.endDate);
  const CardShell = hasGlass ? GlassView : View;

  return (
    <View style={styles.suggRow}>
      {/* Hollow dot — same structure as TripCard inactive dot */}
      <View style={styles.suggTimelineCol}>
        <View style={styles.suggDotSpacer} />
        <View style={styles.suggDot} />
      </View>

      {/* Card — mirrors TripCard layout exactly */}
      <Pressable
        style={({ pressed }) => [styles.suggCardPressable, pressed && { opacity: 0.75 }]}
        onPress={onAdd}
      >
        <CardShell
          {...(hasGlass
            ? { glassEffectStyle: 'regular' as const, style: styles.suggCard }
            : { style: [styles.suggCard, styles.suggCardFallback] }
          )}
        >
          {/* Top row: flag + badges */}
          <View style={styles.suggCardTop}>
            <Text style={styles.suggFlag}>{flag || '🌍'}</Text>
            <View style={styles.suggCardTopRight}>
              <View style={styles.aiBadge}>
                <Text style={styles.aiBadgeText}>✨ AI</Text>
              </View>
              <View style={styles.daysBadge}>
                <Text style={styles.daysText}>{days}d</Text>
              </View>
            </View>
          </View>

          {/* City + country */}
          <Text style={styles.suggCity}>{suggestion.city}</Text>
          <Text style={styles.suggCountry}>{suggestion.country}</Text>

          {/* Dates + transport */}
          <View style={styles.suggCardBottom}>
            <Text style={styles.suggDates}>
              {fmtShort(suggestion.startDate)} – {fmtShort(suggestion.endDate)}
            </Text>
            <View style={styles.suggTransportChip}>
              <Ionicons name={transportIcon(suggestion.transport) as any} size={11} color={Colors.textTertiary} />
              <Text style={styles.suggTransportText}>{suggestion.transport}</Text>
            </View>
          </View>

          {/* Reason */}
          <Text style={styles.suggReason} numberOfLines={2}>{suggestion.reason}</Text>

          {/* Add button */}
          <TouchableOpacity style={styles.suggAddBtn} onPress={onAdd} activeOpacity={0.85}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.suggAddText}>Add this stop</Text>
          </TouchableOpacity>
        </CardShell>
      </Pressable>
    </View>
  );
}

// ─── AI Suggestions Section ───────────────────────────────────────────────────

function AISuggestionsSection({
  suggestions, suggestionsLoading, suggestionsError,
  collapsed, onToggleCollapse, onRefresh, onAdd, hasGlass,
}: {
  suggestions: StopSuggestion[];
  suggestionsLoading: boolean;
  suggestionsError: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRefresh: () => void;
  onAdd: (s: StopSuggestion) => void;
  hasGlass: boolean;
}) {
  const PillShell = hasGlass ? GlassView : View;

  // Shared values
  const progress = useSharedValue(collapsed ? 0 : 1); // 1 = expanded, 0 = collapsed
  const contentHeight = useSharedValue(0);
  const measured = useSharedValue(false);
  const chevronRotation = useSharedValue(collapsed ? -90 : 0);

  useEffect(() => {
    const target = collapsed ? 0 : 1;
    progress.value = withTiming(target, { duration: 380, easing: Easing.bezier(0.4, 0, 0.2, 1) });
    chevronRotation.value = withSpring(collapsed ? -90 : 0, { damping: 18, stiffness: 200 });
  }, [collapsed]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4, 1], [0, 0, 1]),
    height: measured.value
      ? interpolate(progress.value, [0, 1], [0, contentHeight.value])
      : undefined,
    overflow: 'hidden',
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  const statusStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.6, 1], [0, 1]),
    transform: [{ translateX: interpolate(progress.value, [0.6, 1], [8, 0]) }],
  }));

  return (
    <>
      <View style={styles.aiSectionHeader}>
        <View style={styles.aiSectionLineCol} />
        <TouchableOpacity onPress={onToggleCollapse} activeOpacity={0.7}>
          <PillShell
            {...(hasGlass
              ? { glassEffectStyle: 'regular' as const, style: styles.aiPill }
              : { style: [styles.aiPill, styles.aiPillFallback] }
            )}
          >
            <Text style={styles.aiPillText}>✨ AI suggestions</Text>
            <Animated.View style={chevronStyle}>
              <Ionicons name="chevron-down" size={13} color={Colors.primary} />
            </Animated.View>
          </PillShell>
        </TouchableOpacity>

        <Animated.View style={[styles.aiPillRight, statusStyle]}>
          {suggestionsLoading && (
            <Text style={styles.aiPillStatus}>Finding stops…</Text>
          )}
          {suggestionsError && !suggestionsLoading && (
            <Text style={[styles.aiPillStatus, { color: Colors.error }]}>Failed</Text>
          )}
          <TouchableOpacity onPress={onRefresh} disabled={suggestionsLoading} hitSlop={8}>
            <Ionicons
              name="refresh"
              size={15}
              color={suggestionsLoading ? Colors.textTertiary : Colors.primary}
            />
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Animated.View style={contentStyle}>
        <View
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0 && !measured.value) {
              contentHeight.value = h;
              measured.value = true;
            }
          }}
        >
          {suggestions.map((s, i) => (
            <SuggestionLegCard key={i} suggestion={s} onAdd={() => onAdd(s)} />
          ))}
        </View>
      </Animated.View>
    </>
  );
}

// ─── Sheet step type ─────────────────────────────────────────────────────────

type Step = 'closed' | 'country' | 'city' | 'dates' | 'details';

const popularCountries = getPopularCountries();

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function JourneyDetailScreen() {
  const headerHeight = useHeaderHeight();
  const { id, add } = useLocalSearchParams<{ id: string; add?: string }>();
  const journeyId = Number(id);
  const { journey, loading, refresh } = useJourney(journeyId);

  // ─── Sheet state ────────────────────────────────────────────────────────────

  const [step, setStep] = useState<Step>('closed');
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const [editingLeg, setEditingLeg] = useState<JourneyLeg | null>(null);
  const [saving, setSaving] = useState(false);

  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d;
  });
  const [startPickerKey, setStartPickerKey] = useState(0);
  const [endPickerKey, setEndPickerKey] = useState(0);
  const [transport, setTransport] = useState<TransportType>('flight');
  const [notes, setNotes] = useState('');

  // ─── Visa / Tax statuses ─────────────────────────────────────────────────────

  const { user } = useAuth();
  const [visaStatuses, setVisaStatuses] = useState<VisaStatus[]>([]);
  const [taxStatuses, setTaxStatuses] = useState<TaxStatus[]>([]);
  const visaTaxRef = useRef<{ visaTaxContext: string } | null>(null);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;
    Promise.all([getCitizenship(uid), getAllTripsRaw(), getHasFixedResidence(uid)])
      .then(([citizenship, trips, hasFixedResidence]) => {
        if (!citizenship) {
          console.log('[JourneyDetail] no citizenship set — skipping visa/tax');
          return;
        }
        const visa = calculateAllVisaStatuses(trips, citizenship.countryCode);
        const tax = calculateAllTaxStatuses(trips, citizenship.countryCode, hasFixedResidence ?? true);
        console.log('[JourneyDetail] visa:', visa.length, 'tax:', tax.length, 'trips:', trips.length);
        setVisaStatuses(visa);
        setTaxStatuses(tax);

        const visaLines = visa.map((v) =>
          `  ${v.flag} ${v.destination}: ${v.daysRemaining}d remaining / ${v.daysAllowed}d (${v.ruleLabel}) — ${v.status}`
        );
        const taxLines = tax
          .filter((t) => t.status !== 'safe')
          .map((t) =>
            `  ${t.flag} ${t.country}: ${t.daysPresent}/${t.thresholdDays}d (${Math.round(t.percentUsed)}%) — ${t.status}`
          );
        const lines = [`Citizenship: ${citizenship.country} (${citizenship.countryCode})`];
        if (visaLines.length) lines.push('Visa:\n' + visaLines.join('\n'));
        if (taxLines.length) lines.push('Tax warnings:\n' + taxLines.join('\n'));
        visaTaxRef.current = { visaTaxContext: lines.join('\n') };
      })
      .catch((e) => console.error('[JourneyDetail] visa/tax load failed:', e));
  }, [user?.uid]);

  // ─── AI ──────────────────────────────────────────────────────────────────────

  const [suggestions, setSuggestions] = useState<StopSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(false);
  const [suggestionsCollapsed, setSuggestionsCollapsed] = useState(false);

  const cacheKey = `ai_sugg_${journeyId}`;

  // Returns a stable fingerprint of current legs to detect changes
  const legFingerprint = (legs: JourneyLeg[]) =>
    legs.map((l) => l.id).sort((a, b) => a - b).join(',');

  const loadSuggestions = useCallback(async (force = false) => {
    if (!journey || journey.legs.length === 0) return;
    setSuggestionsLoading(true);
    setSuggestionsError(false);
    try {
      if (!force) {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (raw) {
          const { suggestions: cached, fingerprint } = JSON.parse(raw);
          if (fingerprint === legFingerprint(journey.legs) && cached?.length > 0) {
            setSuggestions(cached);
            return;
          }
        }
      }
      const result = await suggestNextStops(
        journey.title,
        journey.legs.map((l) => ({
          city: l.city, country: l.country,
          startDate: l.start_date, endDate: l.end_date,
        })),
        visaTaxRef.current?.visaTaxContext,
      );
      setSuggestions(result);
      await AsyncStorage.setItem(cacheKey, JSON.stringify({
        suggestions: result,
        fingerprint: legFingerprint(journey.legs),
      }));
    } catch (err) {
      console.error('[AI] suggestNextStops failed:', err);
      setSuggestionsError(true);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [journey, cacheKey]);

  // Auto-load when journey is ready (uses cache if legs unchanged)
  useEffect(() => {
    if (journey && journey.legs.length > 0) {
      loadSuggestions(false);
    }
  }, [journey?.id, journey?.legs.length]);

  // City tips for the details step
  const [cityTips, setCityTips] = useState<string | null>(null);
  const [cityTipsLoading, setCityTipsLoading] = useState(false);

  useEffect(() => {
    if (step !== 'details' || !selectedCity || !selectedCountry) return;
    setCityTips(null);
    setCityTipsLoading(true);
    getCityTips(selectedCity, selectedCountry)
      .then(setCityTips)
      .catch(() => setCityTips(null))
      .finally(() => setCityTipsLoading(false));
  }, [step, selectedCity, selectedCountry]);

  // ─── City loading ────────────────────────────────────────────────────────────

  const [cities, setCities] = useState<string[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesHasMore, setCitiesHasMore] = useState(false);
  const [citiesPage, setCitiesPage] = useState(1);
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [citySearchResults, setCitySearchResults] = useState<string[] | null>(null);
  const [citySearchLoading, setCitySearchLoading] = useState(false);

  useEffect(() => {
    if (!selectedCountry) { setCities([]); return; }
    setCitiesPage(1);
    setCitySearchQuery('');
    setCitySearchResults(null);
    setCitiesLoading(true);
    getCitiesByCountryPaginated(selectedCountry, 1, 30).then((r) => {
      setCities(r.cities);
      setCitiesHasMore(r.hasMore);
      setCitiesLoading(false);
    });
  }, [selectedCountry]);

  const handleCitySearch = useCallback((q: string) => {
    setCitySearchQuery(q);
    if (!q.trim()) { setCitySearchResults(null); setCitySearchLoading(false); return; }
    setCitySearchLoading(true);
    searchCitiesByCountry(selectedCountry, q).then((r) => {
      setCitySearchResults(r); setCitySearchLoading(false);
    });
  }, [selectedCountry]);

  const loadMoreCities = useCallback(() => {
    if (citiesLoading || !citiesHasMore) return;
    setCitiesLoading(true);
    const next = citiesPage + 1;
    getCitiesByCountryPaginated(selectedCountry, next, 30).then((r) => {
      setCities((p) => [...p, ...r.cities]);
      setCitiesHasMore(r.hasMore);
      setCitiesPage(next);
      setCitiesLoading(false);
    });
  }, [selectedCountry, citiesPage, citiesLoading, citiesHasMore]);

  // ─── Sheet helpers ────────────────────────────────────────────────────────────

  const closeAll = useCallback(() => {
    if (closing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setClosing(true);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => { setStep('closed'); setClosing(false); }, 350);
  }, [closing]);

  const openAddSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditingLeg(null);
    setSelectedCountry('');
    setSelectedCity('');
    const now = new Date();
    const week = new Date(); week.setDate(week.getDate() + 7);
    setStartDate(now);
    setEndDate(week);
    setStartPickerKey(0);
    setEndPickerKey(0);
    setTransport('flight');
    setNotes('');
    setSaving(false);
    setStep('country');
  }, []);

  // Auto-open add sheet when navigated from a fresh journey creation
  useEffect(() => {
    if (add === '1' && !loading) {
      const t = setTimeout(openAddSheet, 300);
      return () => clearTimeout(t);
    }
  }, [add, loading, openAddSheet]);

  const openEditSheet = useCallback((leg: JourneyLeg) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditingLeg(leg);
    setSelectedCountry(leg.country);
    setSelectedCity(leg.city);
    setStartDate(parseDate(leg.start_date));
    setEndDate(parseDate(leg.end_date));
    setStartPickerKey(0);
    setEndPickerKey(0);
    setTransport(leg.transport);
    setNotes(leg.notes ?? '');
    setSaving(false);
    setStep('country');
  }, []);

  const handleDeleteLeg = useCallback(async (legId: number) => {
    await deleteJourneyLeg(legId);
    refresh();
  }, [refresh]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const code = getCountryCode(selectedCountry);
      const coords = await forwardGeocode(`${selectedCity}, ${selectedCountry}`);
      const notesVal = notes.trim() || null;
      const sortOrder = (journey?.legs.length ?? 0);

      if (editingLeg) {
        await updateJourneyLeg(
          editingLeg.id,
          selectedCity, selectedCountry, code,
          fmt(startDate), fmt(endDate),
          transport, notesVal,
          coords?.latitude, coords?.longitude,
        );
      } else {
        await insertJourneyLeg(
          journeyId,
          selectedCity, selectedCountry, code,
          fmt(startDate), fmt(endDate),
          transport, notesVal,
          sortOrder,
          coords?.latitude, coords?.longitude,
        );
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep('closed');
      setClosing(false);
      refresh();
    } catch (err) {
      console.error('Failed to save leg:', err);
    } finally {
      setSaving(false);
    }
  }, [
    selectedCity, selectedCountry, startDate, endDate,
    transport, notes, editingLeg, journeyId, journey, refresh,
  ]);

  const handleAddSuggestion = useCallback((s: StopSuggestion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditingLeg(null);
    setSelectedCountry(s.country);
    setSelectedCity(s.city);
    setStartDate(parseDate(s.startDate));
    setEndDate(parseDate(s.endDate));
    setStartPickerKey((k) => k + 1);
    setEndPickerKey((k) => k + 1);
    setTransport(s.transport);
    setNotes('');
    setSaving(false);
    setStep('details');
  }, []);

  // ─── Depth mapping ────────────────────────────────────────────────────────────

  const modalOpen = step !== 'closed' || closing;
  const countryVisible = !closing && ['country', 'city', 'dates', 'details'].includes(step);
  const cityVisible    = !closing && ['city', 'dates', 'details'].includes(step);
  const datesVisible   = !closing && ['dates', 'details'].includes(step);
  const detailsVisible = !closing && step === 'details';

  const countryDepth = step === 'country' ? 0 : step === 'city' ? 1 : step === 'dates' ? 2 : step === 'details' ? 3 : 0;
  const cityDepth    = step === 'city' ? 0 : step === 'dates' ? 1 : step === 'details' ? 2 : 0;
  const datesDepth   = step === 'dates' ? 0 : step === 'details' ? 1 : 0;

  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);

  const fmtDateLabel = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // ─── Header ───────────────────────────────────────────────────────────────────

  const headerRight = useCallback(
    () => (
      <Pressable onPress={openAddSheet} hitSlop={8}>
        <Ionicons name="add" size={28} color={Colors.primary} />
      </Pressable>
    ),
    [openAddSheet],
  );

  const legs = journey?.legs ?? [];
  const hasMap = legs.some((l) => l.latitude != null && l.longitude != null);
  // Map: height 420 + marginBottom 20 - marginTop topInset = net contribution
  const timelineLineTop = hasMap ? 360 + 20 - headerHeight : 0;

  // ─── Render ───────────────────────────────────────────────────────────────────

  const PillShell = hasGlass ? GlassView : View;

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerTransparent: true,
          headerShadowVisible: false,
          headerTintColor: Colors.text,
          headerRight,
        }}
      />

      {!loading && legs.length === 0 ? (
        <EmptyState
          icon="✈️"
          title="No stops yet"
          subtitle="Tap + to add your first destination — city, dates, and how you'll get there."
        />
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={styles.content}
        >
          {/* Journey map */}
          <JourneyMapCard legs={legs} headerHeight={headerHeight} />

          {/* Timeline line — starts below map card if present */}
          <View style={[styles.timelineLine, { top: timelineLineTop }]} />

          {legs.map((leg, index) => (
            <LegCard
              key={leg.id}
              leg={leg}
              prevCity={index > 0 ? legs[index - 1].city : null}
              isFirst={index === 0}
              onEdit={openEditSheet}
              onDelete={handleDeleteLeg}
              visaStatuses={visaStatuses}
              taxStatuses={taxStatuses}
            />
          ))}

          {/* AI suggestions — inline timeline */}
          {legs.length > 0 && (
            <AISuggestionsSection
              suggestions={suggestions}
              suggestionsLoading={suggestionsLoading}
              suggestionsError={suggestionsError}
              collapsed={suggestionsCollapsed}
              onToggleCollapse={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSuggestionsCollapsed((c) => !c);
              }}
              onRefresh={() => loadSuggestions(true)}
              onAdd={handleAddSuggestion}
              hasGlass={hasGlass}
            />
          )}

          {/* End cap */}
          {legs.length > 0 && (
            <View style={styles.timelineEndCap}>
              <View style={styles.endCapDot}>
                <View style={styles.endCapDotInner} />
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Sheet layers ── */}
      {modalOpen && (
        <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <SheetBackdrop visible={modalOpen && !closing} onPress={closeAll} />

          {/* Layer 1: Country */}
          <SheetLayer
            visible={countryVisible}
            onClose={closeAll}
            title={editingLeg ? 'Edit Country' : 'Choose Country'}
            searchEnabled
            searchPlaceholder="Search countries..."
            snapPoint={0.5}
            depth={countryDepth}
          >
            {(query: string) => {
              const filtered = query.trim() ? searchCountries(query) : popularCountries;
              return (
                <View style={styles.listContainer}>
                  {!query.trim() && <Text style={styles.listSectionLabel}>Popular</Text>}
                  {filtered.map((name) => {
                    const flag = getCountryFlag(name);
                    return (
                      <TouchableOpacity
                        key={name}
                        style={styles.listItem}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedCountry(name);
                          setStep('city');
                        }}
                        activeOpacity={0.6}
                      >
                        {flag ? <Text style={styles.listItemIcon}>{flag}</Text> : null}
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
            onBack={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStep('country'); }}
            title={selectedCountry}
            searchEnabled
            searchPlaceholder="Search cities..."
            onSearchChange={handleCitySearch}
            snapPoint={0.48}
            depth={cityDepth}
          >
            {() => {
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
                  {isSearching && <Text style={styles.emptyText}>Searching...</Text>}
                  {!isSearching && displayCities.map((name: string, i: number) => (
                    <TouchableOpacity
                      key={`${name}-${i}`}
                      style={styles.listItem}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedCity(name);
                        setStep('dates');
                      }}
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

          {/* Layer 3: Dates */}
          <SheetLayer
            visible={datesVisible}
            onClose={closeAll}
            onBack={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStep('city'); }}
            title="Dates"
            snapPoint={0.48}
            depth={datesDepth}
          >
            {() => (
              <View style={styles.sheetContent}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{selectedCity}, {selectedCountry}</Text>
                  <View style={styles.daysBubble}>
                    <Text style={styles.daysBubbleText}>{days}d</Text>
                  </View>
                </View>
                <View style={styles.dateRow}>
                  <View style={styles.dateField}>
                    <Text style={styles.fieldLabel}>From</Text>
                    <DateTimePicker
                      key={startPickerKey}
                      value={startDate}
                      mode="date"
                      display="compact"
                      maximumDate={endDate}
                      onChange={(_, d) => {
                        if (!d) return;
                        setStartDate(d);
                        setStartPickerKey((k) => k + 1);
                      }}
                    />
                  </View>
                  <View style={styles.dateField}>
                    <Text style={styles.fieldLabel}>To</Text>
                    <DateTimePicker
                      key={endPickerKey}
                      value={endDate}
                      mode="date"
                      display="compact"
                      minimumDate={startDate}
                      onChange={(_, d) => {
                        if (!d) return;
                        setEndDate(d);
                        setEndPickerKey((k) => k + 1);
                      }}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.nextButton}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setStep('details');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.nextButtonText}>Next</Text>
                </TouchableOpacity>
              </View>
            )}
          </SheetLayer>

          {/* Layer 4: Details (transport + notes) */}
          <SheetLayer
            visible={detailsVisible}
            onClose={closeAll}
            onBack={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStep('dates'); }}
            title="Details"
            snapPoint={0.56}
            depth={0}
          >
            {() => (
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.sheetContent}>
                  {/* Summary */}
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{selectedCity}, {selectedCountry}</Text>
                    <Text style={styles.summaryDates}>
                      {fmtDateLabel(startDate)} – {fmtDateLabel(endDate)} · {days}d
                    </Text>
                  </View>

                  {/* Transport picker */}
                  <View>
                    <Text style={styles.fieldLabel}>How are you getting there?</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.transportScroll}
                    >
                      <View style={styles.transportRow}>
                        {TRANSPORTS.map(({ type, icon, label }) => (
                          <TouchableOpacity
                            key={type}
                            style={[
                              styles.transportPill,
                              transport === type && styles.transportPillActive,
                            ]}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setTransport(type);
                            }}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name={icon as any}
                              size={16}
                              color={transport === type ? '#fff' : Colors.text}
                            />
                            <Text
                              style={[
                                styles.transportPillLabel,
                                transport === type && styles.transportPillLabelActive,
                              ]}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>

                  {/* City tips */}
                  {(cityTipsLoading || cityTips) && (
                    <View style={styles.tipsCard}>
                      <Text style={styles.tipsLabel}>✨ Tips for {selectedCity}</Text>
                      {cityTipsLoading ? (
                        <Text style={styles.tipsText}>Loading tips…</Text>
                      ) : (
                        <Text style={styles.tipsText}>{cityTips}</Text>
                      )}
                    </View>
                  )}

                  {/* Notes */}
                  <View>
                    <Text style={styles.fieldLabel}>Notes</Text>
                    <TextInput
                      style={styles.notesInput}
                      value={notes}
                      onChangeText={setNotes}
                      placeholder="Optional notes..."
                      placeholderTextColor={Colors.textTertiary}
                      multiline
                      numberOfLines={3}
                      returnKeyType="done"
                      blurOnSubmit
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                    onPress={handleSave}
                    activeOpacity={0.8}
                    disabled={saving}
                  >
                    <Text style={styles.saveButtonText}>
                      {saving ? 'Saving...' : editingLeg ? 'Update Stop' : 'Add Stop'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            )}
          </SheetLayer>
        </GestureHandlerRootView>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 0,
    paddingBottom: 100,
    position: 'relative',
  },

  // ─── Timeline ───
  timelineLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    // paddingLeft(16) + half dotCol(14) - half lineWidth(1) = 29
    left: 16 + 14 - 1,
    width: 2,
    backgroundColor: Colors.primary + '20',
  },
  timelineEndCap: {
    flexDirection: 'row',
    paddingTop: 4,
    paddingBottom: 16,
  },
  endCapDot: {
    width: 28,
    alignItems: 'center',
    paddingTop: 4,
  },
  endCapDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },

  // ─── Leg wrapper ───
  legWrapper: {
    marginBottom: 4,
  },

  // ─── Connector (between legs) ───
  connector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  connectorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  connectorText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
    maxWidth: 180,
  },

  // ─── Leg row ───
  legRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingRight: 16,
  },
  dotCol: {
    width: 28,
    alignItems: 'center',
    paddingTop: 18,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: '#fff',
  },

  // ─── Leg card ───
  legCard: {
    flex: 1,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  legCardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  legFlag: {
    fontSize: 32,
    lineHeight: 38,
  },
  legCenter: {
    flex: 1,
    gap: 2,
  },
  legCity: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  legCountry: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  legDates: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  legNotes: {
    fontSize: 13,
    color: Colors.textTertiary,
    lineHeight: 18,
    marginTop: 4,
  },
  statusChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  statusChip: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  legRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  daysBadge: {
    backgroundColor: Colors.primary + '14',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  daysText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  transportBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Sheet / list ───
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
    borderBottomColor: Colors.border,
  },
  listItemIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  listItemText: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
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

  // ─── Sheet content ───
  sheetContent: {
    padding: 20,
    gap: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  summaryDates: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  daysBubble: {
    backgroundColor: Colors.primary + '18',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  daysBubbleText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateField: {
    flex: 1,
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  // ─── Transport picker ───
  transportScroll: {
    marginHorizontal: -4,
  },
  transportRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
  },
  transportPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  transportPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  transportPillLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  transportPillLabelActive: {
    color: '#fff',
  },

  // ─── Notes ───
  notesInput: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderCurve: 'continuous',
    padding: 12,
    fontSize: 15,
    color: Colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // ─── Buttons ───
  nextButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
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

  // ─── AI section header (mirrors timeline month pill) ───
  aiSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 16,
  },
  aiSectionLineCol: {
    width: 28,
  },
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
    gap: 4,
  },
  aiPillFallback: {
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  aiPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  aiPillRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 10,
  },
  aiPillStatus: {
    fontSize: 12,
    color: Colors.textTertiary,
  },

  // ─── Suggestion card (mirrors TripCard) ───
  suggRow: {
    flexDirection: 'row',
    paddingRight: 16,
  },
  suggTimelineCol: {
    width: 28,
    alignItems: 'center',
  },
  suggDotSpacer: {
    height: 20,
  },
  suggDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.background,
    zIndex: 1,
  },
  suggCardPressable: {
    flex: 1,
  },
  suggCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 6,
    marginTop: 2,
    overflow: 'hidden',
  },
  suggCardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary + '35',
  },
  suggCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  suggCardTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  suggFlag: {
    fontSize: 28,
  },
  aiBadge: {
    backgroundColor: Colors.primary + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  aiBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  suggCity: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  suggCountry: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  suggCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suggDates: {
    fontSize: 13,
    color: Colors.textTertiary,
  },
  suggTransportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.surfaceSecondary,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  suggTransportText: {
    fontSize: 11,
    color: Colors.textTertiary,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  suggReason: {
    fontSize: 13,
    color: Colors.textTertiary,
    lineHeight: 18,
    marginTop: 6,
  },
  suggAddBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
  },
  suggAddText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  // ─── Journey map ───
  mapCard: {
    height: 360,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
    marginHorizontal: -16,
    marginTop: -20,
    marginBottom: 20,
  },
  map: {
    flex: 1,
  },

  // ─── City tips ───
  tipsCard: {
    backgroundColor: Colors.primary + '0C',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + '22',
    borderCurve: 'continuous',
    padding: 14,
    gap: 6,
  },
  tipsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tipsText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
