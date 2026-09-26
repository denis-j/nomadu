import React, { Children, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Animated, {
  Easing, interpolate,
  useSharedValue, useAnimatedStyle,
  withTiming, withSpring,
  FadeIn, FadeOut,
} from 'react-native-reanimated';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import RNMapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Haptics from 'expo-haptics';
import { useJourney } from '../../../hooks/useJourney';
import { useJourneyDocuments } from '../../../hooks/useJourneyDocuments';
import { useJourneyAccommodations } from '../../../hooks/useAccommodations';
import { consumePendingStay } from '../../../lib/accommodationBridge';
import { planChipText, statusColor } from '../../../components/accommodationForm';
import type { LocalAccommodation } from '../../../lib/accommodations';
import { DocumentsEntryCard } from '../../../components/JourneyDocuments';
import { AvatarStack, avatarPeople, avatarStackWidth, type AvatarPerson } from '../../../components/TravellerAvatars';
import { TravellersContent } from '../../../components/TravellersContent';
import { useAuth } from '../../../hooks/useAuth';
import { EmptyState } from '../../../components/EmptyState';
import { CloudyButton } from '../../../components/CloudyButton';
import { Colors, systemColor } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import {
  JourneyLeg, TransportType,
  parseDate,
  getAllTripsRaw,
  getJourneyWithLegs,
  reorderJourneyLegs,
  updateJourneyTitle,
} from '../../../lib/database';
import { deleteJourneyWithDocuments } from '../../../lib/documents';
import { inviteFriends, leaveTrip, stopSharing } from '../../../lib/shareActions';
import { getCitizenship, getHasFixedResidence } from '../../../lib/onboarding';
import { calculateAllVisaStatuses, VisaStatus } from '../../../lib/visaCalculations';
import { getAllUserVisas } from '../../../lib/userVisas';
import { calculateAllTaxStatuses, TaxStatus } from '../../../lib/taxCalculations';
import { SCHENGEN_COUNTRIES, getRuleForCitizen } from '../../../constants/visaRules';
import { chainDates, countDays, fromYmd, toYmd } from '../../../lib/days';
import { getCountryCode } from '../../../utils/geography';
import { Flag } from '../../../components/Flag';
import { suggestNextStops, StopSuggestion } from '../../../lib/ai';
import { cachedMapSnapshot, storeMapSnapshot } from '../../../lib/mapSnapshot';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { getCitizenshipCache, getTaxStatusesCache, getVisaStatusesCache } from '../../../lib/prefetch';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MissingRoute } from '../../../components/MissingRoute';

const hasGlass = isLiquidGlassAvailable();

// ─── Morph Text (crossfade on value change) ──────────────────────────────────

/**
 * Text that cross-fades when its content changes.
 *
 * The comparison runs on the flattened string, not on the `children` prop.
 * JSX like `{days}d` or `{from} – {to}` hands over a fresh array on every
 * render, so comparing the prop by reference reported a change every time the
 * parent re-rendered and replayed the 350ms fade even though the text was
 * identical. Two of the three call sites on this screen were doing exactly
 * that.
 */
function MorphText({ children, style }: { children: React.ReactNode; style?: any }) {
  const text = Children.toArray(children).join('');
  const opacity = useSharedValue(1);
  const [displayed, setDisplayed] = useState(text);
  const prevRef = useRef(text);

  useEffect(() => {
    if (text !== prevRef.current) {
      // Fade out, swap text, fade in
      opacity.value = withTiming(0, { duration: 150 });
      const t = setTimeout(() => {
        setDisplayed(text);
        prevRef.current = text;
        opacity.value = withTiming(1, { duration: 200 });
      }, 150);
      return () => clearTimeout(t);
    }
  }, [text]);

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

/** "Sep 12 – 18" inside one month, "Sep 28 – Oct 3" across. */
/** The visa and tax statuses as last computed, per account (see the effect in the screen). */
const lastVisaTax = new Map<string, { visa: VisaStatus[]; tax: TaxStatus[]; citizenship: string | null }>();

function fmtRange(start: string, end: string): string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${fmtShort(start)} – ${e.getDate()}`;
  }
  return `${fmtShort(start)} – ${fmtShort(end)}`;
}

/**
 * Where a suggested stop would actually land: the day after the trip's last
 * stop, for as long as the model proposed. The model's own dates are only a
 * guess about the trip's end, and the chain decides anyway.
 */
function chainedSuggestion(s: StopSuggestion, legs: JourneyLeg[]): StopSuggestion {
  const last = legs[legs.length - 1];
  if (!last) return s;
  const days = legDays(s.startDate, s.endDate);
  const start = fromYmd(last.end_date);
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + days - 1);
  return { ...s, startDate: toYmd(start), endDate: toYmd(end) };
}

function legDays(start: string, end: string): number {
  const s = parseDate(start);
  const e = parseDate(end);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1);
}

// ─── Journey Map Card ─────────────────────────────────────────────────────────

const MAP_HEIGHT = 360;
/** Breathing room under the lowest pin. */
const MAP_CHIP_ZONE = 36;
/** Span shown around a single stop: the city and its surroundings, not the continent. */
const SINGLE_STOP_DELTA = 1.2;
/** Bump when the drawing changes (route style, padding) so old pictures are not reused. */
const SNAPSHOT_STYLE = 'v9';
const MAP_PIN = require('../../../assets/icons/map-pin.png');

/**
 * A picture of the route, not a map.
 *
 * The live MKMapView is only mounted until MKMapSnapshotter has drawn it once
 * (pins and dashed route included); from then on the card is an image, cached
 * per set of stops, so scrolling the itinerary costs nothing and reopening the
 * trip shows the map instantly. If the snapshot fails (offline) the live map
 * stays as the fallback.
 *
 * Styled like the Map tab: the standard map and Apple's marker (redrawn as an
 * image, the native one does not survive the snapshotter). The transparent
 * header covers the top, so a lone stop is centred below it and several are
 * fitted into the visible window.
 */
function JourneyMapCard({ legs, headerHeight, onPress }: { legs: JourneyLeg[]; headerHeight: number; onPress: () => void }) {
  // iOS starts the list below the status bar, Android (edge to edge) at the
  // very top; without this the map sat a status bar too high there.
  const safeTop = useSafeAreaInsets().top;
  const listTop = Platform.OS === 'android' ? safeTop : 0;
  const mapRef = useRef<RNMapView>(null);

  const coordLegs = useMemo(
    () => legs.filter((l) => l.latitude != null && l.longitude != null),
    [legs],
  );
  const coords = useMemo(
    () => coordLegs.map((l) => ({ latitude: l.latitude as number, longitude: l.longitude as number })),
    [coordLegs],
  );
  const coordsKey = coords.map((c) => `${c.latitude},${c.longitude}`).join('|');
  const cacheKey = `${SNAPSHOT_STYLE}|${Math.round(headerHeight)}|${coordsKey}`;

  const [snapshot, setSnapshot] = useState<string | null>(() => (coords.length ? cachedMapSnapshot(cacheKey) : null));
  const [ready, setReady] = useState(false);
  const [live, setLive] = useState(false);
  // Only a picture taken just now fades in; one from the cache is simply there.
  const [fresh, setFresh] = useState(false);

  // A new set of stops (and, on opening, the stops arriving at all) looks
  // the picture up in the same render. An effect did it a frame later: the
  // live map and its spinner showed for a frame, then the cached picture
  // faded in, and the glass header over it flickered with every change.
  const [shownFor, setShownFor] = useState(cacheKey);
  if (shownFor !== cacheKey) {
    setShownFor(cacheKey);
    setSnapshot(coords.length ? cachedMapSnapshot(cacheKey) : null);
    setReady(false);
    setLive(false);
    setFresh(false);
  }

  const initialRegion = useMemo(() => {
    if (coords.length === 0) return undefined;
    const lats = coords.map((c) => c.latitude);
    const lngs = coords.map((c) => c.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latDelta = Math.max(SINGLE_STOP_DELTA, (maxLat - minLat) * 1.6);
    const lngDelta = Math.max(SINGLE_STOP_DELTA, (maxLng - minLng) * 1.6);
    // Shift the centre so the pin lands mid-way in the uncovered part.
    const shift = latDelta * ((headerHeight - MAP_CHIP_ZONE) / 2) / MAP_HEIGHT;
    return {
      latitude: (minLat + maxLat) / 2 + shift,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }, [coordsKey, headerHeight]);

  useEffect(() => {
    if (!ready || snapshot || live) return;
    const map = mapRef.current;
    if (!map) return;
    if (coords.length > 1) {
      map.fitToCoordinates(coords, {
        edgePadding: { top: headerHeight + 28, bottom: MAP_CHIP_ZONE + 16, left: 48, right: 48 },
        animated: false,
      });
    }
    // The snapshotter renders its own tiles; it only needs the final region.
    // It has to be passed explicitly: left out, the bridge sends an empty
    // object, which the native side reads as 0°/0° and draws open ocean.
    const t = setTimeout(async () => {
      try {
        const b = await map.getMapBoundaries();
        // A view across the date line (Tokyo and New York on one trip) has
        // its east edge west of its west edge; the raw difference is then
        // negative and MapKit throws a native exception on it, which takes
        // the whole app down. Measure the span the long way round instead.
        let longitudeDelta = b.northEast.longitude - b.southWest.longitude;
        let longitude = (b.northEast.longitude + b.southWest.longitude) / 2;
        if (longitudeDelta < 0) {
          longitudeDelta += 360;
          longitude = b.southWest.longitude + longitudeDelta / 2;
          if (longitude > 180) longitude -= 360;
        }
        const region = {
          latitude: (b.northEast.latitude + b.southWest.latitude) / 2,
          longitude,
          latitudeDelta: b.northEast.latitude - b.southWest.latitude,
          longitudeDelta,
        };
        if (!(region.latitudeDelta > 0) || !(region.longitudeDelta > 0) || region.longitudeDelta > 360) {
          throw new Error(`unusable map region ${JSON.stringify(region)}`);
        }
        const path = await map.takeSnapshot({ region, format: 'png', quality: 1, result: 'file' });
        setFresh(true);
        setSnapshot(storeMapSnapshot(cacheKey, path));
      } catch (err) {
        console.warn('[JourneyMap] snapshot failed, keeping the live map:', err);
        setLive(true);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [ready, snapshot, live, cacheKey, headerHeight]);

  if (coords.length === 0 || !initialRegion) return null;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Open the route on a map" style={[styles.mapCard, { marginTop: listTop - headerHeight }]}>
      {snapshot ? (
        <Image source={{ uri: snapshot }} style={styles.map} contentFit="cover" transition={fresh ? 180 : 0} />
      ) : (
        <>
          <RNMapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_DEFAULT}
            initialRegion={initialRegion}
            // Google Maps (Android) is ready before its tiles are drawn, and a
            // snapshot taken then is an empty grey grid that stays cached.
            {...(Platform.OS === 'android'
              ? { onMapLoaded: () => setReady(true) }
              : { onMapReady: () => setReady(true) })}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            mapType="standard"
          >
            {coords.length > 1 && (
              <Polyline
                coordinates={coords}
                strokeColor="rgba(0,0,0,0.45)"
                strokeWidth={1.5}
                lineDashPattern={[4, 6]}
              />
            )}
            {coordLegs.map((leg) => (
              <Marker
                key={leg.id}
                coordinate={{ latitude: leg.latitude as number, longitude: leg.longitude as number }}
                // Own pin image: the snapshotter draws images cleanly, while
                // Apple's balloon annotation comes out as a black square.
                image={MAP_PIN}
                anchor={{ x: 0.5, y: 1 }}
              />
            ))}
          </RNMapView>
          {!live && (
            <View pointerEvents="none" style={styles.mapPlaceholder}>
              <ActivityIndicator color={Colors.textTertiary} />
            </View>
          )}
        </>
      )}
      {/* A whisper of the background behind the header, for the title over sea. */}
      <LinearGradient
        pointerEvents="none"
        colors={[Colors.background + 'B3', Colors.background + '00']}
        style={[styles.mapFade, { height: headerHeight + 16 }]}
      />
    </Pressable>
  );
}

const ChipShell = hasGlass ? GlassView : View;
const chipGlassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};
/** The bar's height; the discs and the chip are as tall as this. */
const BAR_H = 44;
/** The faces inside the closed chip. */
const FACE = 22;
const MORPH_OPEN = { duration: 400, easing: Easing.bezier(0.4, 0, 0.2, 1) };
const MORPH_CLOSE = { duration: 400, easing: Easing.bezier(0.4, 0, 0.2, 1) };

/** A 44pt glass disc with one symbol: the back and add buttons of the bar. */
function GlassDisc({ icon, size, onPress, label }: { icon: keyof typeof Ionicons.glyphMap; size: number; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <ChipShell {...chipGlassProps} {...(hasGlass ? { isInteractive: true } : {})} style={[styles.disc, !hasGlass && styles.titleChipFallback]}>
        <Ionicons name={icon} size={size} color={Colors.text} />
      </ChipShell>
    </Pressable>
  );
}

/**
 * The header title as the Map tab's glass chip, and like the Map tab's chip
 * it morphs: a tap and the capsule widens and grows downward into the
 * travellers panel, the title row staying where it is at the top, the
 * faces and the invite fading in underneath. Same 400ms curve as the map.
 *
 * Lives in the screen rather than the native header, because a header title
 * cannot grow past the bar; the bar's back and add buttons are drawn here
 * too, as glass discs, so the row reads as one header.
 *
 * Fixed height and a minimum width from the first frame, and no text until
 * the journey is loaded: the capsule must not grow from a one-line "Trip" to
 * two lines a moment later, that moved the whole header centre.
 */
function TripMorphChip({
  journeyId,
  title,
  legs,
  ready,
  owner,
  people,
  open,
  onToggle,
  onLongPress,
  onChanged,
  maxWidth,
}: {
  journeyId: number;
  title: string;
  legs: JourneyLeg[];
  ready: boolean;
  /** Whose trip this is, when it is a friend's. */
  owner: string | null;
  people: AvatarPerson[];
  open: boolean;
  onToggle: () => void;
  onLongPress: () => void;
  onChanged: () => void;
  /** Room between the two discs when closed; the screen's width minus 32 when open. */
  maxWidth: { closed: number; open: number };
}) {
  const span = tripSpan(legs);
  const [chipWidth, setChipWidth] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);
  const progress = useSharedValue(0);
  const [mounted, setMounted] = useState(false);

  // The faces sit on the right edge; the text gets the same room on both
  // sides, so it is centred in the capsule and not in what the faces leave.
  // Two small faces and a "+N": more would push the status line out of
  // the room between the discs.
  const facesWidth = avatarStackWidth(people.length, FACE, 2, 0.35);
  const sidePad = 8 + facesWidth;

  // Measured again when what it holds changes (a renamed trip, a friend
  // joining); kept otherwise, the morph animates from it.
  const contentKey = `${title}|${owner ?? ''}|${span?.status ?? ''}|${facesWidth}`;
  const measuredFor = useRef(contentKey);
  useEffect(() => {
    if (measuredFor.current === contentKey || open) return;
    measuredFor.current = contentKey;
    setChipWidth(0);
  }, [contentKey, open]);

  useEffect(() => {
    if (open) setMounted(true);
    progress.value = withTiming(open ? 1 : 0, open ? MORPH_OPEN : MORPH_CLOSE);
  }, [open, progress]);

  const containerStyle = useAnimatedStyle(() => ({
    width: chipWidth > 0 ? interpolate(progress.value, [0, 1], [chipWidth, maxWidth.open]) : undefined,
    height: panelHeight > 0 ? interpolate(progress.value, [0, 1], [BAR_H, BAR_H + panelHeight]) : BAR_H,
    borderRadius: interpolate(progress.value, [0, 1], [BAR_H / 2, 26]),
  }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.4, 1], [0, 1]),
  }));
  // The small faces hand over to the big ones below as the chip opens.
  const miniFacesStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.3], [1, 0]),
  }));

  return (
    <Animated.View
      style={[styles.morph, !hasGlass && styles.titleChipFallback, containerStyle]}
      onLayout={(e) => {
        // The capsule's natural width, measured once with the text in it.
        if (ready && chipWidth === 0) {
          measuredFor.current = contentKey;
          setChipWidth(Math.min(e.nativeEvent.layout.width, maxWidth.closed));
        }
      }}
    >
      {hasGlass && <GlassView glassEffectStyle="regular" style={StyleSheet.absoluteFill} />}
      <Pressable
        onPress={onToggle}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityRole="header"
        accessibilityState={{ expanded: open }}
        style={[styles.titleChip, { paddingHorizontal: sidePad }]}
      >
        {ready && (
          <>
            <View style={styles.titleChipText}>
              <Text style={styles.titleChipTitle} numberOfLines={1}>{title}</Text>
              <Text style={styles.titleChipSub} numberOfLines={1}>
                {owner ? `with ${owner}` : span ? span.status : 'No stops yet'}
              </Text>
            </View>
            {people.length > 0 && (
              <Animated.View style={[styles.titleChipFaces, miniFacesStyle]}>
                <AvatarStack people={people} size={FACE} max={2} overlap={0.35} />
              </Animated.View>
            )}
          </>
        )}
      </Pressable>
      {/* Mounted on the first opening and kept, measured in the flow below the
          row; the container's animated height reveals it. */}
      {mounted && (
        <Animated.View style={[{ width: maxWidth.open }, panelStyle]} onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)} pointerEvents={open ? 'auto' : 'none'}>
          <TravellersContent journeyId={journeyId} onChanged={onChanged} onClose={onToggle} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** Span of the trip and its countries, for the chip and the summary bar. */
function tripSpan(legs: JourneyLeg[]) {
  if (legs.length === 0) return null;
  const start = legs.reduce((min, l) => (l.start_date < min ? l.start_date : min), legs[0].start_date);
  const end = legs.reduce((max, l) => (l.end_date > max ? l.end_date : max), legs[0].end_date);
  const totalDays = countDays(parseDate(start), parseDate(end));
  const codes: string[] = [];
  for (const l of legs) if (l.country_code && !codes.includes(l.country_code)) codes.push(l.country_code);
  const range = fmtRange(start, end);

  // What matters while planning: how far away it is, or how far in you are.
  const today = toYmd(new Date());
  let status: string;
  if (today < start) {
    const until = countDays(parseDate(today), parseDate(start)) - 1;
    status = until === 1 ? `Starts tomorrow · ${totalDays} days` : `Starts in ${until} days · ${totalDays} days`;
  } else if (today > end) {
    status = `${range} · ${totalDays} ${totalDays === 1 ? 'day' : 'days'}`;
  } else {
    status = `Day ${countDays(parseDate(start), parseDate(today))} of ${totalDays}`;
  }
  return { start, end, totalDays, codes, range, status };
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
  /** No earlier stop in the same country: the place to say how much visa is left. */
  firstInCountry: boolean;
  /** The stop's accommodation plan, when one was started. */
  stay: LocalAccommodation | null;
  onPress: (leg: JourneyLeg) => void;
  /** Tap on the stay chip: straight to the accommodation page. */
  onOpenStay: (leg: JourneyLeg) => void;
  onDrag?: () => void;
  visaStatuses: VisaStatus[];
  taxStatuses: TaxStatus[];
  citizenshipCode: string | null;
  /** Fade the connector in when it appears: for a stop added, not for the ones there on opening. */
  enter?: boolean;
};

const LegCard = React.memo(function LegCard({
  leg,
  firstInCountry,
  stay,
  onPress,
  onOpenStay,
  onDrag,
  visaStatuses,
  taxStatuses,
  citizenshipCode,
  enter = true,
}: LegCardProps) {
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

  // Visa: project the leg against the rule that applies to THIS passport. The
  // citizenship-agnostic default used to answer here, which told a German
  // planning a first US trip "12d > 0d visa" although ESTA gives them 90.
  // Rules with no trackable allowance (visa required, e-visa) get no number.
  const visaRule = citizenshipCode && leg.country_code
    ? getRuleForCitizen(citizenshipCode, leg.country_code)
    : null;
  const visaLimit = visaRule && visaRule.ruleType !== 'visa_required'
    ? visaRule.allowedDays
    : undefined;
  const plannedVisaExceeds = visaLimit !== undefined && plannedDays > visaLimit;

  // Tax: any stay ≥ 183 days is a risk
  const plannedTaxExceeds = plannedDays >= TAX_THRESHOLD;

  // ── Build chips ───────────────────────────────────────────────────────────────
  interface Chip { label: string; color: string; icon?: keyof typeof Ionicons.glyphMap; onPress?: () => void }
  const chips: Chip[] = [];

  // A green "180d left" under every Thai stop is noise: say it once per
  // country, and always when it is a warning.
  if (trackedVisa && (trackedVisa.status !== 'ok' || firstInCountry)) {
    const color = visaChipColor(trackedVisa.status);
    const label = isSchengen
      ? `${trackedVisa.daysRemaining}d Schengen left`
      : `${trackedVisa.daysRemaining}d visa left`;
    chips.push({ label, color });
  } else if (!trackedVisa && plannedVisaExceeds) {
    // No tracked data but this leg alone exceeds the limit
    const label = isSchengen
      ? `${plannedDays}d > ${visaLimit}d Schengen`
      : `${plannedDays}d > ${visaLimit}d visa`;
    chips.push({ label, color: Colors.error });
  }

  if (trackedTax) {
    const color = taxChipColor(trackedTax.status);
    chips.push({ label: `⚠︎ ${trackedTax.daysPresent}/${trackedTax.thresholdDays}d tax`, color });
  } else if (plannedTaxExceeds && !trackedVisa) {
    // Only show projected tax if not already covered by tracked data
    chips.push({ label: `⚠︎ ${plannedDays}d > ${TAX_THRESHOLD}d tax risk`, color: Colors.error });
  }

  // Where you sleep, once that is being planned. Grey until there is a
  // place, black from then on; no third colour.
  if (stay && stay.needed) {
    chips.push({ label: planChipText(stay), color: statusColor(stay.status), icon: 'bed-outline', onPress: () => onOpenStay(leg) });
  }

  const CardWrap = hasGlass ? GlassView : View;
  const cardProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

  // How you get there sits on the line before the stop, for the first one
  // too: a trip starts with a flight. Stops chain, so there is nothing else
  // for the connector to say.
  const transport = TRANSPORTS.find((t) => t.type === leg.transport) ?? TRANSPORTS[0];

  return (
    <View style={styles.legWrapper}>
      <Animated.View
        entering={enter ? FadeIn.duration(250) : undefined}
        exiting={FadeOut.duration(150)}
        style={styles.connector}
      >
        <View style={styles.dotCol} />
        <View style={styles.connectorBadge}>
          <Ionicons name={transport.icon as any} size={13} color={Colors.textSecondary} />
          <MorphText style={styles.connectorText}>{transport.label}</MorphText>
        </View>
      </Animated.View>

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
            <Flag code={leg.country_code ?? ''} size={28} style={styles.legFlagWrap} />

            {/* Center info */}
            <View style={styles.legCenter}>
              <Text style={styles.legCity}>{leg.city}</Text>
              <Text style={styles.legCountry}>{leg.country}</Text>
              <MorphText style={styles.legDates}>
                {fmtRange(leg.start_date, leg.end_date)}
              </MorphText>
              {leg.notes ? (
                <Text style={styles.legNotes} numberOfLines={2}>{leg.notes}</Text>
              ) : null}
              {chips.length > 0 && (
                <View style={styles.statusChipsRow}>
                  {chips.map((chip, i) => (
                    <Pressable
                      key={i}
                      onPress={chip.onPress}
                      disabled={!chip.onPress}
                      hitSlop={chip.onPress ? 6 : undefined}
                      style={({ pressed }) => [styles.statusChip, { backgroundColor: chip.icon ? Colors.surfaceSecondary : chip.color + '14' }, pressed && { opacity: 0.6 }]}
                    >
                      {chip.icon && <Ionicons name={chip.icon} size={12} color={chip.color} style={styles.statusChipIcon} />}
                      <Text style={[styles.statusChipText, { color: chip.color }]}>{chip.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Right badges */}
            <View style={styles.legRight}>
              <View style={styles.daysBadge}>
                <MorphText style={styles.daysText}>{days}d</MorphText>
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
  prev.firstInCountry === next.firstInCountry &&
  prev.stay?.updated_at === next.stay?.updated_at &&
  // The visa and tax chips arrive a moment after the first render; the
  // card must not sit on its first, chipless frame when they do.
  prev.visaStatuses === next.visaStatuses &&
  prev.taxStatuses === next.taxStatuses &&
  prev.citizenshipCode === next.citizenshipCode
);

// ─── Suggestion Leg Card ──────────────────────────────────────────────────────

/**
 * A suggested stop looks like a leg that is not there yet: same anatomy as
 * LegCard, dashed outline instead of a surface, hollow timeline dot. The whole
 * card adds it; there is no second button.
 */
function SuggestionLegCard({
  suggestion,
  onAdd,
  disabled,
}: {
  suggestion: StopSuggestion;
  onAdd: () => void;
  disabled?: boolean;
}) {
  const countryCode = getCountryCode(suggestion.country);
  const days = legDays(suggestion.startDate, suggestion.endDate);

  return (
    <View style={styles.legRow}>
      <View style={styles.dotCol}>
        <View style={styles.suggDot} />
      </View>
      <Pressable
        onPress={onAdd}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Add ${suggestion.city}, ${suggestion.country}`}
        style={({ pressed }) => [styles.suggCard, pressed && { opacity: 0.6 }, disabled && { opacity: 0.5 }]}
      >
        <Flag code={countryCode} size={28} style={styles.legFlagWrap} />
        <View style={styles.legCenter}>
          <Text style={styles.legCity}>{suggestion.city}</Text>
          <Text style={styles.legCountry}>{suggestion.country}</Text>
          <Text style={styles.legDates}>
            {fmtShort(suggestion.startDate)} – {fmtShort(suggestion.endDate)}
          </Text>
          <Text style={styles.suggReason}>{suggestion.reason}</Text>
          <View style={styles.suggAdd}>
            <Ionicons name="add" size={14} color={Colors.text} />
            <Text style={styles.suggAddText}>Add this stop</Text>
          </View>
        </View>
        <View style={styles.legRight}>
          <View style={styles.daysBadge}>
            <Text style={styles.daysText}>{days}d</Text>
          </View>
          <View style={styles.transportBadge}>
            <Ionicons name={transportIcon(suggestion.transport) as any} size={14} color={Colors.primary} />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function SuggestionSkeleton() {
  return (
    <View style={styles.legRow}>
      <View style={styles.dotCol}>
        <View style={styles.suggDot} />
      </View>
      <View style={styles.suggCard}>
        <View style={styles.skeletonFlag} />
        <View style={styles.legCenter}>
          <View style={[styles.skeletonBar, { width: '55%' }]} />
          <View style={[styles.skeletonBar, { width: '35%' }]} />
          <View style={[styles.skeletonBar, { width: '80%', marginTop: 8 }]} />
        </View>
      </View>
    </View>
  );
}

// ─── AI Suggestions Section ───────────────────────────────────────────────────

const PREFERENCE_CHIPS = ['Beaches', 'Islands', 'Mountains', 'Cheap cities', 'Nightlife', 'Culture'];

function AISuggestionsSection({
  suggestions, loading, error,
  collapsed, onToggleCollapse, onRefresh, onAdd,
  preference, onRefine,
}: {
  suggestions: StopSuggestion[];
  loading: boolean;
  error: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRefresh: () => void;
  onAdd: (s: StopSuggestion) => void;
  preference: string;
  /** Reload with a new wish ('' clears it). */
  onRefine: (preference: string) => void;
}) {
  const PillShell = hasGlass ? GlassView : View;
  const custom = preference.trim() !== '' && !PREFERENCE_CHIPS.includes(preference);
  const [showInput, setShowInput] = useState(custom);
  const [draft, setDraft] = useState(custom ? preference : '');
  // The wish is restored from the cache after mount; keep the field in step.
  useEffect(() => { if (custom) setDraft(preference); }, [custom, preference]);

  // Only the chevron is animated by hand. The content itself is mounted or
  // not; the parent wraps the toggle in a LayoutAnimation, so the list grows
  // and shrinks natively. A first version tweened the height with Reanimated,
  // which re-laid out the whole list on every frame and stuttered.
  const chevronRotation = useSharedValue(collapsed ? -90 : 0);
  useEffect(() => {
    chevronRotation.value = withSpring(collapsed ? -90 : 0, { damping: 18, stiffness: 200 });
  }, [collapsed]);
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  const pickChip = (chip: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowInput(false);
    onRefine(preference === chip ? '' : chip);
  };

  const submitDraft = () => {
    const next = draft.trim();
    if (!next) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onRefine(next);
  };

  return (
    <>
      <View style={styles.aiSectionHeader}>
        <View style={styles.aiSectionLineCol} />
        <TouchableOpacity onPress={onToggleCollapse} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ expanded: !collapsed }}>
          <PillShell
            {...(hasGlass
              ? { glassEffectStyle: 'regular' as const, style: styles.aiPill }
              : { style: [styles.aiPill, styles.aiPillFallback] }
            )}
          >
            <Ionicons name="sparkles" size={12} color={Colors.text} />
            <Text style={styles.aiPillText}>AI suggestions</Text>
            <Animated.View style={chevronStyle}>
              <Ionicons name="chevron-down" size={13} color={Colors.textSecondary} />
            </Animated.View>
          </PillShell>
        </TouchableOpacity>
        {!collapsed && (
        <View style={styles.aiHeaderRight}>
          {loading ? (
            <Text style={styles.aiStatus}>Finding stops…</Text>
          ) : (
            <TouchableOpacity onPress={onRefresh} hitSlop={10} accessibilityRole="button" accessibilityLabel="New suggestions">
              <Ionicons name="refresh" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        )}
      </View>

      {!collapsed && (
        <View>
          {/* One tap steers the next batch; the last chip opens free text. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.aiChipsRow}>
            {PREFERENCE_CHIPS.map((chip) => {
              const active = preference === chip;
              return (
                <Pressable
                  key={chip}
                  onPress={() => pickChip(chip)}
                  disabled={loading}
                  style={[styles.aiChip, active && styles.aiChipActive]}
                >
                  <Text style={[styles.aiChipText, active && styles.aiChipTextActive]}>{chip}</Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowInput((v) => !v);
              }}
              disabled={loading}
              style={[styles.aiChip, (custom || showInput) && styles.aiChipActive]}
            >
              <Ionicons name="create-outline" size={12} color={custom || showInput ? Colors.white : Colors.text} />
              <Text style={[styles.aiChipText, (custom || showInput) && styles.aiChipTextActive]}>
                {custom ? preference : 'Something else'}
              </Text>
            </Pressable>
          </ScrollView>

          {showInput && (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.aiInputRow}>
              <TextInput
                style={styles.aiInput}
                value={draft}
                onChangeText={setDraft}
                placeholder="Somewhere quiet by the sea, good coffee…"
                placeholderTextColor={systemColor('placeholderText')}
                returnKeyType="search"
                onSubmitEditing={submitDraft}
                maxLength={120}
                editable={!loading}
                autoFocus
              />
              <TouchableOpacity
                onPress={submitDraft}
                disabled={loading || !draft.trim()}
                accessibilityRole="button"
                accessibilityLabel="Get suggestions"
                style={{ opacity: !draft.trim() || loading ? 0.3 : 1 }}
                hitSlop={8}
              >
                <Ionicons name="arrow-up-circle" size={28} color={Colors.text} />
              </TouchableOpacity>
            </Animated.View>
          )}

          {error && !loading && (
            <Pressable onPress={onRefresh} style={styles.legRow}>
              <View style={styles.dotCol}>
                <View style={styles.suggDot} />
              </View>
              <View style={[styles.suggCard, styles.aiErrorCard]}>
                <Ionicons name="cloud-offline-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.aiErrorText}>Could not reach the AI. Tap to try again.</Text>
              </View>
            </Pressable>
          )}

          {loading && suggestions.length === 0 && (
            <>
              <SuggestionSkeleton />
              <SuggestionSkeleton />
            </>
          )}

          {suggestions.map((s, i) => (
            <SuggestionLegCard key={`${s.city}-${i}`} suggestion={s} onAdd={() => onAdd(s)} disabled={loading} />
          ))}
        </View>
      )}
    </>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function JourneyDetailScreen() {
  const router = useRouter();
  const { id, travellers: openTravellersParam } = useLocalSearchParams<{ id: string; travellers?: string }>();
  const journeyId = Number(id);
  const { journey, loading, refresh, setJourney } = useJourney(journeyId);
  // The native header is off for this screen (see _layout.tsx); the bar is
  // drawn below at the same place, so the map maths keep the same number.
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + BAR_H;
  const docs = useJourneyDocuments(journeyId);
  // A friend's trip: shown as they planned it, nothing here changes it.
  const readOnly = !!journey?.shared_owner_uid;
  // The list waits for the plans (and, below, the visa and tax statuses)
  // too: a stop card that grows a chip a frame after it appeared reads as
  // a flicker.
  const { plans: stays, loaded: staysLoaded } = useJourneyAccommodations(journeyId);

  // ─── Visa / Tax statuses ─────────────────────────────────────────────────────

  const { user } = useAuth();
  // What the last visit computed, so the chips are on the cards in their
  // first frame when the screen comes back; the fresh computation below
  // replaces them once it is in.
  // On the first visit, what start-up already computed from the same trips
  // and visas (lib/prefetch.ts), so the list need not wait for it.
  const prefetched = getVisaStatusesCache();
  const known = user?.uid
    ? lastVisaTax.get(user.uid) ?? (prefetched && getCitizenshipCache()
      ? { visa: prefetched, tax: getTaxStatusesCache() ?? [], citizenship: getCitizenshipCache()!.countryCode }
      : undefined)
    : undefined;
  const [visaStatuses, setVisaStatuses] = useState<VisaStatus[]>(known?.visa ?? []);
  const [taxStatuses, setTaxStatuses] = useState<TaxStatus[]>(known?.tax ?? []);
  const [citizenshipCode, setCitizenshipCode] = useState<string | null>(known?.citizenship ?? null);
  const [visaLoaded, setVisaLoaded] = useState(!user?.uid || !!known);
  const visaTaxRef = useRef<{ visaTaxContext: string } | null>(null);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) {
      setVisaLoaded(true);
      return;
    }
    Promise.all([
      getCitizenship(uid),
      getAllTripsRaw(),
      getHasFixedResidence(uid),
      getAllUserVisas(),
    ])
      .then(([citizenship, trips, hasFixedResidence, userVisas]) => {
        if (!citizenship) {
          console.log('[JourneyDetail] no citizenship set, skipping visa/tax');
          return;
        }
        const visa = calculateAllVisaStatuses(trips, citizenship.countryCode, userVisas);
        setCitizenshipCode(citizenship.countryCode);
        const tax = calculateAllTaxStatuses(trips, citizenship.countryCode, hasFixedResidence ?? true);
        console.log('[JourneyDetail] visa:', visa.length, 'tax:', tax.length, 'trips:', trips.length);
        lastVisaTax.set(uid, { visa, tax, citizenship: citizenship.countryCode });
        setVisaStatuses(visa);
        setTaxStatuses(tax);

        const visaLines = visa.map((v) =>
          `  ${v.flag} ${v.destination}: ${v.daysRemaining}d remaining / ${v.daysAllowed}d (${v.ruleLabel}), ${v.status}`
        );
        const taxLines = tax
          .filter((t) => t.status !== 'safe')
          .map((t) =>
            `  ${t.flag} ${t.country}: ${t.daysPresent}/${t.thresholdDays}d (${Math.round(t.percentUsed)}%), ${t.status}`
          );
        const lines = [`Citizenship: ${citizenship.country} (${citizenship.countryCode})`];
        if (visaLines.length) lines.push('Visa:\n' + visaLines.join('\n'));
        if (taxLines.length) lines.push('Tax warnings:\n' + taxLines.join('\n'));
        visaTaxRef.current = { visaTaxContext: lines.join('\n') };
      })
      .catch((e) => console.error('[JourneyDetail] visa/tax load failed:', e))
      .finally(() => setVisaLoaded(true));
  }, [user?.uid]);

  // ─── AI ──────────────────────────────────────────────────────────────────────

  const [suggestions, setSuggestions] = useState<StopSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(false);
  const [suggestionsCollapsed, setSuggestionsCollapsed] = useState(false);
  const [aiPreference, setAiPreference] = useState('');

  const cacheKey = `ai_sugg_${journeyId}`;
  // Collapsed is remembered per trip: a finished itinerary should not grow
  // three ghost stops every time it is opened.
  const collapsedKey = `ai_sugg_collapsed_${journeyId}`;

  // Returns a stable fingerprint of current legs to detect changes
  const legFingerprint = (legs: JourneyLeg[]) =>
    legs.map((l) => l.id).sort((a, b) => a - b).join(',');

  const loadSuggestions = useCallback(async (force = false, preference?: string) => {
    if (!journey || journey.legs.length === 0) return;
    setSuggestionsLoading(true);
    setSuggestionsError(false);
    try {
      if (!force) {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (raw) {
          const { suggestions: cached, fingerprint, pref } = JSON.parse(raw);
          if (fingerprint === legFingerprint(journey.legs) && (pref ?? '') === (preference ?? '') && cached?.length > 0) {
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
        preference,
      );
      setSuggestions(result);
      await AsyncStorage.setItem(cacheKey, JSON.stringify({
        suggestions: result,
        fingerprint: legFingerprint(journey.legs),
        pref: preference ?? '',
      }));
    } catch (err) {
      console.error('[AI] suggestNextStops failed:', err);
      setSuggestionsError(true);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [journey, cacheKey]);

  // When the journey is ready: restore the wish and the collapsed state, then
  // ask the AI only if the section is actually open. Collapsed costs nothing.
  useEffect(() => {
    if (!journey || journey.legs.length === 0) return;
    let cancelled = false;
    (async () => {
      let pref = '';
      let collapsed = false;
      try {
        const [flag, raw] = await Promise.all([
          AsyncStorage.getItem(collapsedKey),
          AsyncStorage.getItem(cacheKey),
        ]);
        collapsed = flag === '1';
        if (raw) pref = JSON.parse(raw).pref ?? '';
      } catch {}
      if (cancelled) return;
      setSuggestionsCollapsed(collapsed);
      if (pref) setAiPreference(pref);
      if (!collapsed) loadSuggestions(false, pref || undefined);
    })();
    return () => { cancelled = true; };
  }, [journey?.id, journey?.legs.length]);

  const toggleSuggestions = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !suggestionsCollapsed;
    LayoutAnimation.configureNext(LayoutAnimation.create(280, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setSuggestionsCollapsed(next);
    AsyncStorage.setItem(collapsedKey, next ? '1' : '0').catch(() => {});
    if (!next && suggestions.length === 0) loadSuggestions(false, aiPreference || undefined);
  }, [suggestionsCollapsed, suggestions.length, aiPreference, loadSuggestions, collapsedKey]);

  const refineSuggestions = useCallback((pref: string) => {
    setAiPreference(pref);
    loadSuggestions(true, pref || undefined);
  }, [loadSuggestions]);

  // ─── Navigation helpers ────────────────────────────────────────────────────

  const openAddSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // The next stop starts the day after the last one ends; only its length
    // is up for choosing. A week is the starting point.
    const last = journey?.legs[journey.legs.length - 1];
    let chained: { start: string; end: string; lockStart: string } | null = null;
    if (last) {
      const start = fromYmd(last.end_date);
      start.setDate(start.getDate() + 1);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      chained = { start: toYmd(start), end: toYmd(end), lockStart: '1' };
    }
    router.push({
      pathname: '/(tabs)/(plans)/add-stop/country',
      params: { journeyId: String(journeyId), ...(chained ?? {}) },
    });
  }, [router, journeyId, journey?.legs]);

  const openStay = useCallback((leg: JourneyLeg) => {
    if (!leg.sync_id || !journey?.sync_id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/(tabs)/(plans)/accommodation',
      params: {
        stopSyncId: leg.sync_id,
        journeySyncId: journey.sync_id,
        city: leg.city,
        country: leg.country,
        countryCode: leg.country_code,
        start: leg.start_date,
        end: leg.end_date,
        ...(readOnly && { readOnly: '1' }),
      },
    });
  }, [router, journey?.sync_id, readOnly]);

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
        ...(leg.latitude != null && leg.longitude != null && { latitude: String(leg.latitude), longitude: String(leg.longitude) }),
        ...(leg.notes && { notes: leg.notes }),
        ...(journey?.legs[0]?.id !== leg.id && { lockStart: '1' }),
        ...(leg.sync_id && journey?.sync_id && { stopSyncId: leg.sync_id, journeySyncId: journey.sync_id }),
        ...(readOnly && { readOnly: '1' }),
      },
    });
  }, [router, journeyId, journey?.legs, journey?.sync_id, readOnly]);

  // The stop sheet closes and leaves the stop behind; the page is pushed
  // from here, after the sheet's dismissal has run, so it is laid out at
  // full size (see accommodationBridge).
  useFocusEffect(
    useCallback(() => {
      const stay = consumePendingStay();
      if (!stay) return;
      const { readOnly: ro, ...rest } = stay;
      const t = setTimeout(() => router.push({ pathname: '/(tabs)/(plans)/accommodation', params: { ...rest, ...(ro && { readOnly: '1' }) } }), 350);
      return () => clearTimeout(t);
    }, [router]),
  );

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

  const legs = journey?.legs ?? [];

  const openMap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/(tabs)/(plans)/journey-map', params: { journeyId: String(journeyId) } });
  }, [router, journeyId]);

  // Long press on the title: the same sheet the trip list offers, so a trip
  // can be renamed or removed from where you are looking at it.
  const tripActions = useCallback(() => {
    if (!journey) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (readOnly) {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: journey.title, options: ['Leave trip', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
        async (i) => {
          if (i !== 0) return;
          await leaveTrip(journey);
          if (!(await getJourneyWithLegs(journeyId))) router.back();
        },
      );
      return;
    }
    const shared = !!journey.share_code;
    const options = ['Invite friends', ...(shared ? ['Stop sharing'] : []), 'Rename', 'Delete trip', 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: journey.title, options, destructiveButtonIndex: options.length - 2, cancelButtonIndex: options.length - 1 },
      (i) => {
        const rename = shared ? 2 : 1;
        if (i === 0) {
          inviteFriends(journey).then(refresh);
        } else if (shared && i === 1) {
          stopSharing(journey).then(refresh);
        } else if (i === rename) {
          Alert.prompt('Rename trip', undefined, async (name) => {
            const next = (name ?? '').trim();
            if (!next || next === journey.title) return;
            await updateJourneyTitle(journeyId, next);
            refresh();
          }, 'plain-text', journey.title);
        } else if (i === rename + 1) {
          Alert.alert('Delete this trip?', 'Stops and documents go with it.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { await deleteJourneyWithDocuments(journeyId); router.back(); } },
          ]);
        }
      },
    );
  }, [journey, journeyId, readOnly, refresh, router]);

  // The travellers panel unfolds from the chip rather than sliding up as a
  // sheet: the faces are in the chip, so that is where they open.
  // Like the Map tab's chip: a firm tap opening, a soft one closing.
  const [travellersOpen, setTravellersOpen] = useState(openTravellersParam === '1');
  const toggleTravellers = useCallback(() => {
    setTravellersOpen((v) => {
      Haptics.impactAsync(v ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
      return !v;
    });
  }, []);
  const closeTravellers = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTravellersOpen(false);
  }, []);
  const travellersChanged = useCallback(() => {
    refresh();
    docs.refresh();
  }, [refresh, docs.refresh]);

  const people = useMemo(
    () => avatarPeople(docs.travellers, docs.uid, journey?.shared_owner_uid ? { shared_owner_uid: journey.shared_owner_uid, shared_owner_name: journey.shared_owner_name } : null),
    [docs.travellers, docs.uid, journey?.shared_owner_uid, journey?.shared_owner_name],
  );


  // ─── Timeline line offset ──────────────────────────────────────────────────
  const [timelineTop, setTimelineTop] = useState(0);
  const [contentSize, setContentSize] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);

  // ─── Drag & Drop reorder ─────────────────────────────────────────────────────

  const handleReorder = useCallback(({ data }: { data: JourneyLeg[] }) => {
    // A stop takes its length with it; the trip keeps its start date and the
    // dates re-flow along the new order.
    const anchor = legs[0]?.start_date;
    const dates = chainDates(data, anchor);
    const reorderedLegs = data.map((leg, i) => ({ ...leg, ...dates[i] }));

    // Optimistic update
    setJourney((prev) => prev ? { ...prev, legs: reorderedLegs } : prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Persist in background
    reorderJourneyLegs(journeyId, reorderedLegs.map((l) => l.id), anchor).catch((err) =>
      console.error('Failed to persist reorder:', err),
    );
  }, [journeyId, legs, setJourney]);

  // The stops there when the list first shows appear with it; only one
  // added later fades its connector in. Fading them all on opening, next to
  // cards that were simply there, read as a flicker.
  const initialLegIds = useRef<Set<number> | null>(null);
  if (staysLoaded && visaLoaded && initialLegIds.current === null && legs.length > 0) {
    initialLegIds.current = new Set(legs.map((l) => l.id));
  }

  const renderItem = useCallback(({ item, drag, getIndex }: RenderItemParams<JourneyLeg>) => {
    const index = getIndex() ?? 0;
    return (
      <ScaleDecorator>
        <LegCard
          leg={item}
          firstInCountry={!legs.slice(0, index).some((l) => l.country_code === item.country_code)}
          stay={item.sync_id ? stays.get(item.sync_id) ?? null : null}
          onPress={openStopInfo}
          onOpenStay={openStay}
          onDrag={readOnly ? undefined : drag}
          visaStatuses={visaStatuses}
          taxStatuses={taxStatuses}
          citizenshipCode={citizenshipCode}
          enter={!initialLegIds.current?.has(item.id)}
        />
      </ScaleDecorator>
    );
  }, [legs, stays, openStopInfo, openStay, readOnly, visaStatuses, taxStatuses, citizenshipCode]);

  const onHeaderLayout = useCallback((e: any) => {
    setTimelineTop(e.nativeEvent.layout.height);
  }, []);

  // The line runs from the header down to the end cap. It lives inside the
  // header so it scrolls natively with the content; a first version moved it
  // by hand from scroll events, which arrive on the JS thread a frame late.
  const lineHeight = contentSize > timelineTop ? contentSize - timelineTop - footerHeight - 70 : 0;
  const lineColor = Colors.primary + '20';

  const listHeader = useMemo(() => (
    <View onLayout={onHeaderLayout}>
      <JourneyMapCard legs={legs} headerHeight={headerHeight} onPress={openMap} />
      <DocumentsEntryCard journeyId={journeyId} documents={docs.documents} travellers={docs.travellers} />
      {legs.length > 0 && timelineTop > 0 && lineHeight > 0 && (
        <View pointerEvents="none" style={[styles.timelineLine, { top: timelineTop, height: lineHeight }]}>
          <LinearGradient
            colors={['transparent', lineColor, lineColor, 'transparent']}
            locations={[0, 0.04, 0.96, 1]}
            style={{ flex: 1 }}
          />
        </View>
      )}
    </View>
  ), [legs, headerHeight, onHeaderLayout, journeyId, docs.documents, docs.travellers, timelineTop, lineHeight, openMap]);

  const chainedSuggestions = useMemo(() => suggestions.map((s) => chainedSuggestion(s, legs)), [suggestions, legs]);

  const listFooter = useMemo(() => (
    <>
      {legs.length > 0 && !readOnly && (
        <AISuggestionsSection
          suggestions={chainedSuggestions}
          loading={suggestionsLoading}
          error={suggestionsError}
          collapsed={suggestionsCollapsed}
          onToggleCollapse={toggleSuggestions}
          onRefresh={() => loadSuggestions(true, aiPreference || undefined)}
          onAdd={handleAddSuggestion}
          preference={aiPreference}
          onRefine={refineSuggestions}
        />
      )}
      {legs.length > 0 && (
        <View onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)} style={styles.timelineEndCap}>
          <View style={styles.endCapDot}>
            <View style={styles.endCapDotInner} />
          </View>
        </View>
      )}
    </>
  ), [legs.length, readOnly, chainedSuggestions, suggestionsLoading, suggestionsError, suggestionsCollapsed, aiPreference, handleAddSuggestion, loadSuggestions, toggleSuggestions, refineSuggestions]);

  // ─── Render ───────────────────────────────────────────────────────────────────

  const { width: screenWidth } = useWindowDimensions();
  // Between the two discs (16 + 44 + 8 on each side) when closed.
  const chipWidths = useMemo(() => ({ closed: screenWidth - 2 * (16 + BAR_H + 8), open: screenWidth - 32 }), [screenWidth]);

  // A made-up or deleted trip id showed an empty trip with "Add your first
  // stop", which added stops to a trip that does not exist.
  if (!loading && (!journey || journey.deleted)) {
    return <MissingRoute title="Trip" message="This trip is no longer here." />;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      {!loading && legs.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="✈️"
            title="No stops yet"
            subtitle={readOnly ? `${journey?.shared_owner_name ?? 'Your friend'} has not planned any stops yet.` : "City, dates, and how you'll get there. The rest builds from that."}
          />
          {!readOnly && (
            <View style={styles.emptyCta}>
              <CloudyButton onPress={openAddSheet} style={{ width: '100%' }} innerStyle={{ justifyContent: 'center' }}>
                <Text style={styles.emptyCtaText}>Add your first stop</Text>
              </CloudyButton>
            </View>
          )}
        </View>
      ) : (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <DraggableFlatList
            data={staysLoaded && visaLoaded ? legs : []}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            onDragEnd={handleReorder}
            ListHeaderComponent={listHeader}
            // Not before the stops: shown alone, the suggestions sat right under
            // the documents and were pushed down when the stops came in.
            ListFooterComponent={staysLoaded && visaLoaded ? listFooter : null}
            contentInsetAdjustmentBehavior="never"
            // Without a map nothing pushes the content below the transparent header.
            contentContainerStyle={styles.content}
            activationDistance={15}
            onContentSizeChange={(_, h) => setContentSize(h)}
          />
        </GestureHandlerRootView>
      )}
      {/* Behind the open chip: a touch anywhere else folds it back. */}
      {travellersOpen && <Pressable style={StyleSheet.absoluteFill} onPress={closeTravellers} accessibilityLabel="Close" />}

      {/* The bar: two discs and the chip between them, over the map. */}
      <View style={[styles.bar, { top: insets.top }]} pointerEvents="box-none">
        <GlassDisc icon="chevron-back" size={24} onPress={() => router.back()} label="Back" />
        <View style={styles.barSpacer} pointerEvents="none" />
        {!readOnly && <GlassDisc icon="add" size={28} onPress={openAddSheet} label="Add a stop" />}
      </View>
      <View style={[styles.morphSlot, { top: insets.top }]} pointerEvents="box-none">
        <TripMorphChip
          journeyId={journeyId}
          title={journey?.title ?? ''}
          legs={legs}
          // With the travellers too: their faces came a moment later and
          // widened a capsule that had already been measured without them.
          ready={!!journey && docs.loaded}
          owner={journey?.shared_owner_name ?? null}
          people={people}
          open={travellersOpen}
          onToggle={toggleTravellers}
          onLongPress={tripActions}
          onChanged={travellersChanged}
          maxWidth={chipWidths}
        />
      </View>
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

  emptyWrap: { flex: 1 },
  emptyCta: { paddingHorizontal: 32, paddingBottom: 140 },
  emptyCtaText: { ...Typography.buttonLarge, color: Colors.cloudyButtonText, textAlign: 'center' },

  // ─── Timeline ───
  timelineLine: {
    position: 'absolute',
    left: 14 - 1, // half dotCol - half lineWidth (the header sits inside the padded content)
    width: 2,
    overflow: 'hidden',
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
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  connectorText: {
    ...Typography.caption,
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
    borderColor: Colors.white,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  legFlagWrap: {
    marginTop: 2,
  },
  legCenter: {
    flex: 1,
    gap: 2,
  },
  legCity: {
    ...Typography.bodyLarge,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  legCountry: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  legDates: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  legNotes: {
    ...Typography.bodySmall,
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
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderCurve: 'continuous',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusChipIcon: { marginRight: 4 },
  statusChipText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  legRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  daysBadge: {
    backgroundColor: Colors.primary + '14',
    borderRadius: 8,
    borderCurve: 'continuous',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  daysText: {
    ...Typography.caption,
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
    paddingVertical: 7,
    overflow: 'hidden',
    gap: 6,
  },
  aiPillFallback: {
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  aiPillText: {
    ...Typography.bodySmall,
    fontWeight: '600',
    color: Colors.text,
  },
  aiHeaderRight: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiStatus: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },

  // ─── Refine (chips + optional free text) ───
  aiChipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingLeft: 28,
    paddingRight: 16,
    paddingBottom: 10,
  },
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  aiChipActive: {
    backgroundColor: Colors.text,
    borderColor: Colors.text,
  },
  aiChipText: {
    ...Typography.caption,
    fontWeight: '600',
    color: Colors.text,
  },
  aiChipTextActive: {
    color: Colors.white,
  },
  aiInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 28,
    marginRight: 16,
    marginBottom: 10,
  },
  aiInput: {
    flex: 1,
    ...Typography.bodySmall,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  // ─── Suggestion card (a leg that is not there yet) ───
  suggDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: Colors.background,
  },
  suggCard: {
    flex: 1,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  suggReason: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginTop: 6,
  },
  suggAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 10,
  },
  suggAddText: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.text,
  },
  skeletonFlag: {
    width: 28,
    height: 20,
    borderRadius: 4,
    backgroundColor: Colors.border,
    marginTop: 2,
  },
  skeletonBar: {
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.border,
    marginTop: 6,
  },
  aiErrorCard: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  aiErrorText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    flex: 1,
  },

  // ─── Journey map ───
  mapCard: {
    height: MAP_HEIGHT,
    marginHorizontal: -16,
    marginBottom: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceSecondary,
  },
  // ─── The bar over the map: two discs and the morphing chip ───
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: BAR_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  barSpacer: { flex: 1 },
  disc: {
    width: BAR_H,
    height: BAR_H,
    borderRadius: BAR_H / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  morphSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  morph: {
    overflow: 'hidden',
    borderCurve: 'continuous',
    alignItems: 'center',
  },
  // ─── Title chip (same material as the Map tab's chip) ───
  titleChip: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
    height: BAR_H,
  },
  titleChipText: { alignItems: 'center', flexShrink: 1 },
  titleChipFaces: { position: 'absolute', right: 8, top: (BAR_H - FACE) / 2 },
  titleChipFallback: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  titleChipTitle: { ...Typography.button, fontSize: 15 },
  titleChipSub: { ...Typography.caption, color: Colors.textSecondary, marginTop: 1, fontVariant: ['tabular-nums'] },
  map: {
    flex: 1,
  },
  mapFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  mapPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
