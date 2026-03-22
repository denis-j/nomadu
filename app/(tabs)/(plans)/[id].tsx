import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withSpring, interpolate, Easing,
  FadeIn, FadeOut,
} from 'react-native-reanimated';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import RNMapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Haptics from 'expo-haptics';
import { useJourney } from '../../../hooks/useJourney';
import { useAuth } from '../../../hooks/useAuth';
import { EmptyState } from '../../../components/EmptyState';
import { Colors } from '../../../constants/colors';
import {
  JourneyLeg, TransportType,
  parseDate,
  getAllTripsRaw,
  reorderJourneyLegs,
} from '../../../lib/database';
import { getCitizenship, getHasFixedResidence } from '../../../lib/onboarding';
import { calculateAllVisaStatuses, VisaStatus } from '../../../lib/visaCalculations';
import { calculateAllTaxStatuses, TaxStatus } from '../../../lib/taxCalculations';
import { SCHENGEN_COUNTRIES, DEFAULT_VISA_RULES } from '../../../constants/visaRules';
import { countryCodeToFlag } from '../../../lib/geocoding';
import { getCountryCode } from '../../../utils/geography';
import { suggestNextStops, StopSuggestion } from '../../../lib/ai';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const hasGlass = isLiquidGlassAvailable();

// ─── Morph Text (crossfade on value change) ──────────────────────────────────

function MorphText({ children, style }: { children: string; style?: any }) {
  const opacity = useSharedValue(1);
  const [displayed, setDisplayed] = useState(children);
  const prevRef = useRef(children);

  useEffect(() => {
    if (children !== prevRef.current) {
      // Fade out, swap text, fade in
      opacity.value = withTiming(0, { duration: 150 }, (finished) => {
        if (finished) {
          // runOnJS doesn't work here directly, use withTiming callback
        }
      });
      // Schedule text swap + fade in
      const t = setTimeout(() => {
        setDisplayed(children);
        prevRef.current = children;
        opacity.value = withTiming(1, { duration: 200 });
      }, 150);
      return () => clearTimeout(t);
    }
  }, [children]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.Text style={[style, animStyle]}>{displayed}</Animated.Text>
  );
}

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

function fmtShort(dateStr: string): string {
  const d = parseDate(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function legDays(start: string, end: string): number {
  const s = parseDate(start);
  const e = parseDate(end);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1);
}

// ─── Trip Summary ────────────────────────────────────────────────────────────

function TripSummary({ legs }: { legs: JourneyLeg[] }) {
  const stats = useMemo(() => {
    if (legs.length === 0) return null;
    const totalDays = legs.reduce((sum, l) => sum + legDays(l.start_date, l.end_date), 0);
    const countries = new Set(legs.map((l) => l.country)).size;
    const cities = new Set(legs.map((l) => l.city)).size;
    const firstDate = legs.reduce((min, l) => l.start_date < min ? l.start_date : min, legs[0].start_date);
    const lastDate = legs.reduce((max, l) => l.end_date > max ? l.end_date : max, legs[0].end_date);
    return { totalDays, countries, cities, firstDate, lastDate };
  }, [legs]);

  if (!stats) return null;

  const CardWrap = hasGlass ? GlassView : View;
  const cardProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

  return (
    <CardWrap {...cardProps} style={[styles.summaryBar, !hasGlass && styles.summaryBarFallback]}>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryValue}>{stats.totalDays}</Text>
        <Text style={styles.summaryLabel}>days</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryItem}>
        <Text style={styles.summaryValue}>{stats.cities}</Text>
        <Text style={styles.summaryLabel}>{stats.cities === 1 ? 'city' : 'cities'}</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryItem}>
        <Text style={styles.summaryValue}>{stats.countries}</Text>
        <Text style={styles.summaryLabel}>{stats.countries === 1 ? 'country' : 'countries'}</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryItem}>
        <Text style={styles.summaryValue}>{fmtShort(stats.firstDate)}</Text>
        <Text style={styles.summaryLabel}>{fmtShort(stats.lastDate)}</Text>
      </View>
    </CardWrap>
  );
}

// ─── Journey Map Card ─────────────────────────────────────────────────────────

function JourneyMapCard({ legs, headerHeight, scrollY }: { legs: JourneyLeg[]; headerHeight: number; scrollY: Animated.SharedValue<number> }) {
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

  const MAP_HEIGHT = 360;

  const stretchStyle = useAnimatedStyle(() => {
    // Only stretch when actively pulling down (ignore initial small negative offsets)
    const overscroll = Math.max(0, -scrollY.value - 110);
    if (overscroll <= 0) return {};
    const scale = 1 + overscroll / MAP_HEIGHT;
    return {
      transform: [
        { translateY: -overscroll / 2 },
        { scale },
      ],
    };
  });

  if (coordLegs.length === 0 || !region) return null;

  const polyCoords = coordLegs.map((l) => ({
    latitude: l.latitude as number,
    longitude: l.longitude as number,
  }));

  return (
    <Animated.View style={[styles.mapCard, { marginTop: -headerHeight }, stretchStyle]}>
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
    </Animated.View>
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

type LegCardProps = {
  leg: JourneyLeg;
  prevCity: string | null;
  isFirst: boolean;
  onPress: (leg: JourneyLeg) => void;
  onDrag?: () => void;
  visaStatuses: VisaStatus[];
  taxStatuses: TaxStatus[];
};

const LegCard = React.memo(function LegCard({
  leg,
  prevCity,
  isFirst,
  onPress,
  onDrag,
  visaStatuses,
  taxStatuses,
}: LegCardProps) {
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

  const CardWrap = hasGlass ? GlassView : View;
  const cardProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

  return (
    <View style={styles.legWrapper}>
      {/* Connector between legs */}
      {!isFirst && (
        <Animated.View
          entering={FadeIn.duration(250)}
          exiting={FadeOut.duration(150)}
          style={styles.connector}
        >
          <View style={styles.dotCol} />
          <View style={styles.connectorBadge}>
            <Ionicons
              name={transportIcon(leg.transport) as any}
              size={13}
              color={Colors.textSecondary}
            />
            {prevCity ? (
              <MorphText style={styles.connectorText}>
                {`from ${prevCity}`}
              </MorphText>
            ) : null}
          </View>
        </Animated.View>
      )}

      {/* Leg row: dot col + card */}
      <Pressable
        onPress={() => onPress(leg)}
        onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onDrag?.(); }}
        delayLongPress={200}
        style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
      >
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
              <MorphText style={styles.legDates}>
                {fmtShort(leg.start_date)} – {fmtShort(leg.end_date)}
              </MorphText>
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
                <MorphText style={styles.daysText}>{days}d</MorphText>
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
      </Pressable>
    </View>
  );
}, (prev, next) =>
  prev.leg.id === next.leg.id &&
  prev.leg.start_date === next.leg.start_date &&
  prev.leg.end_date === next.leg.end_date &&
  prev.leg.transport === next.leg.transport &&
  prev.leg.notes === next.leg.notes &&
  prev.leg.city === next.leg.city &&
  prev.leg.country === next.leg.country &&
  prev.prevCity === next.prevCity &&
  prev.isFirst === next.isFirst
);

// ─── Suggestion Leg Card ──────────────────────────────────────────────────────

function SuggestionLegCard({
  suggestion,
  onAdd,
  disabled,
}: {
  suggestion: StopSuggestion;
  onAdd: () => void;
  disabled?: boolean;
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
        style={({ pressed }) => [styles.suggCardPressable, pressed && !disabled && { opacity: 0.75 }, disabled && { opacity: 0.5 }]}
        onPress={onAdd}
        disabled={disabled}
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
          <TouchableOpacity
            style={[styles.suggAddBtn, disabled && { opacity: 0.4 }]}
            onPress={onAdd}
            activeOpacity={0.85}
            disabled={disabled}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.suggAddText}>{disabled ? 'Loading…' : 'Add this stop'}</Text>
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
            <SuggestionLegCard key={i} suggestion={s} onAdd={() => onAdd(s)} disabled={suggestionsLoading} />
          ))}
        </View>
      </Animated.View>
    </>
  );
}

// ─── Timeline Line (scrolls with content but stays put during drag) ──────────

function TimelineLine({ scrollY, topOffset }: { scrollY: Animated.SharedValue<number>; topOffset: number }) {
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -scrollY.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.timelineLine,
        { top: topOffset },
        animStyle,
      ]}
    />
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function JourneyDetailScreen() {
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const { id, add } = useLocalSearchParams<{ id: string; add?: string }>();
  const journeyId = Number(id);
  const { journey, loading, refresh, setJourney } = useJourney(journeyId);

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

  // ─── Navigation helpers ────────────────────────────────────────────────────

  const openAddSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/(tabs)/(plans)/add-stop/country',
      params: { journeyId: String(journeyId) },
    });
  }, [router, journeyId]);

  // Auto-open add sheet once when navigated from a fresh journey creation
  const didAutoOpen = useRef(false);
  useEffect(() => {
    if (add === '1' && !loading && !didAutoOpen.current) {
      didAutoOpen.current = true;
      const t = setTimeout(openAddSheet, 300);
      return () => clearTimeout(t);
    }
  }, [add, loading, openAddSheet]);

  const openStopInfo = useCallback((leg: JourneyLeg) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/(tabs)/(plans)/stop-info',
      params: {
        legId: String(leg.id),
        journeyId: String(journeyId),
        country: leg.country,
        countryCode: leg.country_code,
        city: leg.city,
        start: leg.start_date,
        end: leg.end_date,
        transport: leg.transport,
        ...(leg.notes && { notes: leg.notes }),
      },
    });
  }, [router, journeyId]);

  const handleAddSuggestion = useCallback((s: StopSuggestion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/(tabs)/(plans)/add-stop/details',
      params: {
        journeyId: String(journeyId),
        country: s.country,
        city: s.city,
        start: s.startDate,
        end: s.endDate,
        transport: s.transport,
      },
    });
  }, [router, journeyId]);

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

  // ─── Scroll tracking for stretchy map ────────────────────────────────────────

  const scrollY = useSharedValue(0);

  // ─── Timeline line offset ──────────────────────────────────────────────────
  const [timelineTop, setTimelineTop] = useState(0);

  // ─── Drag & Drop reorder ─────────────────────────────────────────────────────

  const handleReorder = useCallback(({ data }: { data: JourneyLeg[] }) => {
    // Date slots stay at their positions — only the stops move
    const originalDateSlots = legs.map((l) => ({
      start_date: l.start_date,
      end_date: l.end_date,
    }));

    // Assign original date slots to new positions
    const reorderedLegs = data.map((leg, i) => ({
      ...leg,
      start_date: originalDateSlots[i].start_date,
      end_date: originalDateSlots[i].end_date,
    }));

    // Optimistic update
    setJourney((prev) => prev ? { ...prev, legs: reorderedLegs } : prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Persist in background
    const ids = reorderedLegs.map((l) => l.id);
    reorderJourneyLegs(journeyId, ids, originalDateSlots).catch((err) =>
      console.error('Failed to persist reorder:', err),
    );
  }, [journeyId, legs, setJourney]);

  const renderItem = useCallback(({ item, drag, getIndex }: RenderItemParams<JourneyLeg>) => {
    const index = getIndex() ?? 0;
    return (
      <ScaleDecorator>
        <LegCard
          leg={item}
          prevCity={index > 0 ? legs[index - 1]?.city ?? null : null}
          isFirst={index === 0}
          onPress={openStopInfo}
          onDrag={drag}
          visaStatuses={visaStatuses}
          taxStatuses={taxStatuses}
        />
      </ScaleDecorator>
    );
  }, [legs, openStopInfo, visaStatuses, taxStatuses]);

  const onHeaderLayout = useCallback((e: any) => {
    setTimelineTop(e.nativeEvent.layout.height);
  }, []);

  const listHeader = useMemo(() => (
    <View onLayout={onHeaderLayout}>
      <JourneyMapCard legs={legs} headerHeight={headerHeight} scrollY={scrollY} />
      <TripSummary legs={legs} />
    </View>
  ), [legs, headerHeight, scrollY, onHeaderLayout]);

  const listFooter = useMemo(() => (
    <>
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
      {legs.length > 0 && (
        <View style={styles.timelineEndCap}>
          <View style={styles.endCapDot}>
            <View style={styles.endCapDotInner} />
          </View>
        </View>
      )}
    </>
  ), [legs.length, suggestions, suggestionsLoading, suggestionsError, suggestionsCollapsed, handleAddSuggestion, loadSuggestions]);

  // ─── Render ───────────────────────────────────────────────────────────────────

  const tripName = journey?.title ?? 'Trip';

  return (
    <>
      <Stack.Screen
        options={{
          title: tripName,
          headerTransparent: true,
          headerShadowVisible: false,
          headerTintColor: Colors.text,
          headerBackButtonDisplayMode: 'minimal',
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
        <GestureHandlerRootView style={{ flex: 1 }}>
          {/* Static timeline line — doesn't move during drag */}
          {legs.length > 0 && timelineTop > 0 && (
            <TimelineLine scrollY={scrollY} topOffset={timelineTop} />
          )}
          <DraggableFlatList
            data={legs}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            onDragEnd={handleReorder}
            onScrollOffsetChange={(offset) => { scrollY.value = offset; }}
            ListHeaderComponent={listHeader}
            ListFooterComponent={listFooter}
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={styles.content}
            activationDistance={15}
          />
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
  },

  // ─── Summary bar ───
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  summaryBarFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryItem: {
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },

  // ─── Timeline ───
  timelineLine: {
    position: 'absolute',
    left: 16 + 14 - 1, // paddingLeft + half dotCol - half lineWidth
    width: 2,
    height: 5000, // tall enough to cover all content
    backgroundColor: Colors.primary + '20',
    zIndex: 0,
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

});
