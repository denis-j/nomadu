import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { AppState, Dimensions, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { Typography, FontSize } from '../../../constants/typography';
import { Flag } from '../../../components/Flag';
import { parseDate, Trip } from '../../../lib/database';
import { VisaStatus } from '../../../lib/visaCalculations';
import { TaxStatus } from '../../../lib/taxCalculations';
import { SCHENGEN_COUNTRIES } from '../../../constants/visaRules';
import { checkLocationPermissions, foregroundLocationCheck, isTrackingActive, startBackgroundTracking } from '../../../lib/location';
import { useTranslation } from '../../../contexts/LanguageContext';
import { appLocale } from '../../../lib/i18n/locale';

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
  const { t, countryName } = useTranslation();
  const [chipWidth, setChipWidth] = useState(0);
  const [rowHeight, setRowHeight] = useState(0);
  const [statsHeight, setStatsHeight] = useState(0);
  const progress = useSharedValue(0);
  const isExpanded = useSharedValue(false);

  const totalDaysInCity = trips
    .filter((t) => t.city === currentTrip.city && t.country_code === currentTrip.country_code)
    .reduce((s, t) => s + t.days, 0);

  // Arrived date
  const arrivedDate = parseDate(currentTrip.start_date);
  const now = new Date();
  const sameYear = arrivedDate.getFullYear() === now.getFullYear();
  const arrived = arrivedDate.toLocaleDateString(appLocale(), {
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
          <Flag code={currentTrip.country_code} size={16} />
          <Text style={styles.chipCity}>{currentTrip.city}</Text>
          <View style={styles.chipDivider} />
          <Text style={styles.chipCountry}>{countryName(currentTrip.country)}</Text>
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
            <StatItem value={t('comp.daysShort', { n: currentTrip.days })} label={t('map.here')} />
            <View style={styles.statSep} />
            <StatItem value={arrived} label={t('map.arrived')} />
            <View style={styles.statSep} />
            <StatItem value={t('comp.daysShort', { n: totalDaysInCity })} label={t('map.allStays')} />
          </View>

          {/* Row 2: Visa + Tax */}
          {(visaStatus || taxStatus) && (
            <>
              <View style={styles.expandDivider} />
              <View style={styles.trackingRow}>
                {visaStatus && (
                  <View style={styles.trackingItem}>
                    <Text style={styles.trackingLabel}>{t('map.visa')}</Text>
                    <Text style={[styles.trackingValue, { color: visaStatusColor(visaStatus.status) }]}>
                      {t('map.daysLeft', { days: visaStatus.daysRemaining })}
                    </Text>
                    <Text style={styles.trackingSubLabel}>{t('map.ofDays', { days: visaStatus.daysAllowed })}</Text>
                  </View>
                )}
                {visaStatus && taxStatus && <View style={styles.statSep} />}
                {taxStatus && (
                  <View style={styles.trackingItem}>
                    <Text style={styles.trackingLabel}>{t('map.tax')}</Text>
                    <Text style={[styles.trackingValue, { color: taxStatusColor(taxStatus.status) }]}>
                      {t('comp.daysShort', { n: `${taxStatus.daysPresent}/${taxStatus.thresholdDays}` })}
                    </Text>
                    <Text style={styles.trackingSubLabel}>{t('map.rule183')}</Text>
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
  const { t } = useTranslation();
  const { trips, loading, refresh } = useTrips();
  const { visaStatuses } = useVisaTracker();
  const { taxStatuses } = useTaxTracker();
  const appState = useRef(AppState.currentState);
  const [detecting, setDetecting] = useState(false);
  // Null until the first check, so the empty chip does not flash the wrong
  // hint before we know which one applies.
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);

  // On mount and when returning to foreground: fetch location immediately if
  // tracking is active, then refresh trips so the chip updates without waiting
  // for the next background wake-up.
  useEffect(() => {
    async function checkAndRefresh() {
      const perms = await checkLocationPermissions();
      setHasLocationPermission(perms.foreground);
      if (!perms.foreground) return;

      // Start background tracking if permission allows and task isn't running yet
      if (perms.isAlways) {
        const active = await isTrackingActive();
        if (!active) await startBackgroundTracking();
      }

      // Always do a foreground check, only needs foreground permission
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
        ) : !loading && (detecting || hasLocationPermission !== null) ? (
          <ChipWrapper
            {...chipGlassProps}
            style={[styles.chip, !hasGlass && styles.chipFallback]}
          >
            <Ionicons name={detecting ? 'locate-outline' : 'navigate-outline'} size={16} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>
              {/* Asking for tracking only makes sense when it is actually
                  off. With permission granted and no trips yet, the first
                  recorded location is simply still to come. */}
              {detecting
                ? t('map.detecting')
                : hasLocationPermission
                  ? t('map.firstStay')
                  : t('map.enableTracking')}
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
    // iOS lays the tab bar over the map, Android ends the map above it.
    bottom: Platform.OS === 'ios' ? 100 : 24,
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
  chipCity: {
    ...Typography.button,
  },
  chipDivider: {
    width: 1,
    height: 14,
    backgroundColor: Colors.border,
  },
  chipCountry: {
    ...Typography.bodySmall,
    fontSize: FontSize.subheadline,
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
    ...Typography.numericMedium,
  },
  statLabel: {
    ...Typography.eyebrow,
    fontWeight: '500',
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
    ...Typography.eyebrow,
    fontSize: FontSize.caption2,
    letterSpacing: 0.6,
  },
  trackingValue: {
    ...Typography.titleMedium,
    fontVariant: ['tabular-nums'],
  },
  trackingSubLabel: {
    fontSize: FontSize.caption2,
    color: Colors.textTertiary,
  },
  // ─── Empty state chip ───
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 100,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxWidth: '80%',
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
    ...Typography.bodySmall,
    fontSize: FontSize.footnote,
    flexShrink: 1,
    color: Colors.textSecondary,
  },
});
