import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { AppState, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import RNMapView, { PROVIDER_DEFAULT } from 'react-native-maps';
import { MapView } from '../../../components/MapView';
import { useTrips } from '../../../hooks/useTrips';
import { useVisaTracker } from '../../../hooks/useVisaTracker';
import { useTaxTracker } from '../../../hooks/useTaxTracker';
import { Colors } from '../../../constants/colors';
import { countryCodeToFlag } from '../../../lib/geocoding';
import { parseDate, Trip } from '../../../lib/database';
import { VisaStatus } from '../../../lib/visaCalculations';
import { TaxStatus } from '../../../lib/taxCalculations';
import { SCHENGEN_COUNTRIES } from '../../../constants/visaRules';
import { checkLocationPermissions, foregroundLocationCheck, isTrackingActive, startBackgroundTracking } from '../../../lib/location';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const EXPANDED_WIDTH = SCREEN_WIDTH - 32;
const hasGlass = isLiquidGlassAvailable();
const ChipWrapper = hasGlass ? GlassView : View;
const chipGlassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};
const OPEN_CONFIG = { duration: 400, easing: Easing.bezier(0.4, 0, 0.2, 1) };
const CLOSE_CONFIG = { duration: 400, easing: Easing.bezier(0.4, 0, 0.2, 1) };

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function visaStatusColor(status: VisaStatus['status']): string {
  if (status === 'exceeded' || status === 'critical') return Colors.error;
  if (status === 'warning') return Colors.warning;
  return Colors.success;
}

function taxStatusColor(status: TaxStatus['status']): string {
  if (status === 'resident' || status === 'warning') return Colors.error;
  if (status === 'caution') return Colors.warning;
  return Colors.success;
}

interface MorphChipProps {
  trips: Trip[];
  currentTrip: Trip;
  visaStatuses: VisaStatus[];
  taxStatuses: TaxStatus[];
}

function MorphChip({ trips, currentTrip, visaStatuses, taxStatuses }: MorphChipProps) {
  const [chipWidth, setChipWidth] = useState(0);
  const [rowHeight, setRowHeight] = useState(0);
  const [statsHeight, setStatsHeight] = useState(0);
  const progress = useSharedValue(0);
  const isExpanded = useSharedValue(false);

  const flag = countryCodeToFlag(currentTrip.country_code);
  const totalDaysInCity = trips
    .filter((t) => t.city === currentTrip.city && t.country_code === currentTrip.country_code)
    .reduce((s, t) => s + t.days, 0);

  // Arrived date
  const arrivedDate = parseDate(currentTrip.start_date);
  const now = new Date();
  const sameYear = arrivedDate.getFullYear() === now.getFullYear();
  const arrived = arrivedDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: '2-digit' }),
  });

  // Find visa status for current country (handle Schengen)
  const isSchengen = (SCHENGEN_COUNTRIES as readonly string[]).includes(currentTrip.country_code);
  const visaStatus = visaStatuses.find((v) =>
    isSchengen ? v.destinationCode === 'SCHENGEN' : v.destinationCode === currentTrip.country_code
  ) ?? null;

  // Find tax status for current country
  const taxStatus = taxStatuses.find((t) => t.countryCode === currentTrip.country_code) ?? null;

  const handlePress = () => {
    const next = !isExpanded.value;
    isExpanded.value = next;
    if (next) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      progress.value = withTiming(1, OPEN_CONFIG);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      progress.value = withTiming(0, CLOSE_CONFIG);
    }
  };

  const PAD = 28; // paddingVertical 14 * 2
  const collapsedH = rowHeight > 0 ? rowHeight + PAD : 0;
  const expandedH = rowHeight > 0 && statsHeight > 0 ? rowHeight + statsHeight + PAD : 0;

  const containerStyle = useAnimatedStyle(() => ({
    width:
      chipWidth > 0
        ? interpolate(progress.value, [0, 1], [chipWidth, EXPANDED_WIDTH])
        : undefined,
    borderRadius: interpolate(progress.value, [0, 1], [100, 22]),
    height:
      collapsedH > 0 && expandedH > 0
        ? interpolate(progress.value, [0, 1], [collapsedH, expandedH])
        : undefined,
    overflow: 'hidden',
  }));

  const statsOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.4, 1], [0, 1]),
  }));

  return (
    <Pressable onPress={handlePress}>
      <Animated.View
        style={[styles.morphContainer, containerStyle]}
        onLayout={(e) => {
          if (chipWidth === 0) setChipWidth(e.nativeEvent.layout.width);
        }}
      >
        {/* Glass / fallback background */}
        {hasGlass ? (
          <GlassView glassEffectStyle="regular" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.morphFallback]} />
        )}

        {/* Always-visible chip row */}
        <View
          style={styles.chipRow}
          onLayout={(e) => {
            if (rowHeight === 0) setRowHeight(e.nativeEvent.layout.height);
          }}
        >
          <Text style={styles.chipFlag}>{flag}</Text>
          <Text style={styles.chipCity}>{currentTrip.city}</Text>
          <View style={styles.chipDivider} />
          <Text style={styles.chipCountry}>{currentTrip.country}</Text>
        </View>

        {/* Stats – always mounted, clipped by height + faded by opacity */}
        <Animated.View
          style={[styles.statsSection, statsOpacity]}
          onLayout={(e) => {
            if (statsHeight === 0) setStatsHeight(e.nativeEvent.layout.height);
          }}
        >
          <View style={styles.expandDivider} />

          {/* Row 1: Here · Arrived · Total */}
          <View style={styles.statsRow}>
            <StatItem value={`${currentTrip.days}d`} label="Here" />
            <View style={styles.statSep} />
            <StatItem value={arrived} label="Arrived" />
            <View style={styles.statSep} />
            <StatItem value={`${totalDaysInCity}d`} label="All Stays" />
          </View>

          {/* Row 2: Visa + Tax */}
          {(visaStatus || taxStatus) && (
            <>
              <View style={styles.expandDivider} />
              <View style={styles.trackingRow}>
                {visaStatus && (
                  <View style={styles.trackingItem}>
                    <Text style={styles.trackingLabel}>VISA</Text>
                    <Text style={[styles.trackingValue, { color: visaStatusColor(visaStatus.status) }]}>
                      {visaStatus.daysRemaining}d left
                    </Text>
                    <Text style={styles.trackingSubLabel}>of {visaStatus.daysAllowed}d</Text>
                  </View>
                )}
                {visaStatus && taxStatus && <View style={styles.statSep} />}
                {taxStatus && (
                  <View style={styles.trackingItem}>
                    <Text style={styles.trackingLabel}>TAX</Text>
                    <Text style={[styles.trackingValue, { color: taxStatusColor(taxStatus.status) }]}>
                      {taxStatus.daysPresent}/{taxStatus.thresholdDays}d
                    </Text>
                    <Text style={styles.trackingSubLabel}>183d rule</Text>
                  </View>
                )}
              </View>
            </>
          )}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export default function MapScreen() {
  const { trips, loading, refresh } = useTrips();
  const { visaStatuses } = useVisaTracker();
  const { taxStatuses } = useTaxTracker();
  const appState = useRef(AppState.currentState);
  const [detecting, setDetecting] = useState(false);

  // On mount and when returning to foreground: fetch location immediately if
  // tracking is active, then refresh trips so the chip updates without waiting
  // for the next background wake-up.
  useEffect(() => {
    async function checkAndRefresh() {
      const perms = await checkLocationPermissions();
      if (!perms.foreground) return;

      // Start background tracking if permission allows and task isn't running yet
      if (perms.isAlways) {
        const active = await isTrackingActive();
        if (!active) await startBackgroundTracking();
      }

      // Always do a foreground check — only needs foreground permission
      setDetecting(true);
      await foregroundLocationCheck();
      await refresh();
      setDetecting(false);
    }

    checkAndRefresh();

    const sub = AppState.addEventListener('change', async (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        checkAndRefresh();
      }
      appState.current = next;
    });

    return () => sub.remove();
  }, []);

  const hasTrips = !loading && trips.length > 0;
  const currentTrip = hasTrips ? trips[0] : null;

  return (
    <View style={styles.container}>
      {hasTrips ? (
        <MapView trips={trips} />
      ) : (
        <RNMapView
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_DEFAULT}
          initialRegion={{
            latitude: 30,
            longitude: 0,
            latitudeDelta: 100,
            longitudeDelta: 100,
          }}
          showsUserLocation
          showsCompass={false}
          mapType="standard"
        />
      )}

      <View style={styles.chipContainer}>
        {currentTrip ? (
          <MorphChip
            key={`${currentTrip.id}-${currentTrip.city}-${currentTrip.country}`}
            trips={trips}
            currentTrip={currentTrip}
            visaStatuses={visaStatuses}
            taxStatuses={taxStatuses}
          />
        ) : !loading ? (
          <ChipWrapper
            {...chipGlassProps}
            style={[styles.chip, !hasGlass && styles.chipFallback]}
          >
            <Ionicons name={detecting ? 'locate-outline' : 'navigate-outline'} size={16} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>
              {detecting ? 'Detecting your location…' : 'Enable location tracking to see your trips'}
            </Text>
          </ChipWrapper>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chipContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  // ─── MorphChip ───
  morphContainer: {
    overflow: 'hidden',
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  morphFallback: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chipFlag: {
    fontSize: 20,
  },
  chipCity: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  chipDivider: {
    width: 1,
    height: 14,
    backgroundColor: Colors.border,
  },
  chipCountry: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  statsSection: {},
  expandDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginTop: 12,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingBottom: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statSep: {
    width: StyleSheet.hairlineWidth,
    height: 36,
    backgroundColor: Colors.border,
  },
  // ─── Tracking row (Visa + Tax) ───
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackingItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingBottom: 2,
  },
  trackingLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  trackingValue: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  trackingSubLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  // ─── Empty state chip ───
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  chipFallback: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
