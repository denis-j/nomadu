import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { Colors } from '../../../constants/colors';
import { countryCodeToFlag } from '../../../lib/geocoding';
import { Trip } from '../../../lib/database';

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

function MorphChip({ trips, currentTrip }: { trips: Trip[]; currentTrip: Trip }) {
  const [expanded, setExpanded] = useState(false);
  const [chipWidth, setChipWidth] = useState(0);
  const [chipRowHeight, setChipRowHeight] = useState(0);
  const progress = useSharedValue(0);

  const flag = countryCodeToFlag(currentTrip.country_code);
  const uniqueCountries = new Set(trips.map((t) => t.country_code)).size;
  const totalDays = trips.reduce((s, t) => s + t.days, 0);

  const handlePress = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      progress.value = withTiming(1, OPEN_CONFIG);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      progress.value = withTiming(0, CLOSE_CONFIG);
    }
  };

  const containerStyle = useAnimatedStyle(() => ({
    width:
      chipWidth > 0
        ? interpolate(progress.value, [0, 1], [chipWidth, EXPANDED_WIDTH])
        : undefined,
    borderRadius: interpolate(progress.value, [0, 1], [100, 22]),
    paddingVertical: interpolate(progress.value, [0, 1], [10, 14]),
    paddingHorizontal: interpolate(progress.value, [0, 1], [16, 18]),
    maxHeight: interpolate(
      progress.value,
      [0, 1],
      [chipRowHeight > 0 ? chipRowHeight + 20 : 50, 200]
    ),
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
            if (chipRowHeight === 0) setChipRowHeight(e.nativeEvent.layout.height);
          }}
        >
          <Text style={styles.chipFlag}>{flag}</Text>
          <Text style={styles.chipCity}>{currentTrip.city}</Text>
          <View style={styles.chipDivider} />
          <Text style={styles.chipCountry}>{currentTrip.country}</Text>
        </View>

        {/* Stats – always mounted, clipped by maxHeight + faded by opacity */}
        <Animated.View style={[styles.statsSection, statsOpacity]}>
          <View style={styles.expandDivider} />
          <View style={styles.statsRow}>
            <StatItem value={`${currentTrip.days}d`} label="Here" />
            <View style={styles.statSep} />
            <StatItem value={String(uniqueCountries)} label="Countries" />
            <View style={styles.statSep} />
            <StatItem value={`${totalDays}d`} label="Total" />
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export default function MapScreen() {
  const { trips, loading } = useTrips();

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
          <MorphChip key={`${currentTrip.id}-${currentTrip.city}-${currentTrip.country}`} trips={trips} currentTrip={currentTrip} />
        ) : !loading ? (
          <ChipWrapper
            {...chipGlassProps}
            style={[styles.chip, !hasGlass && styles.chipFallback]}
          >
            <Ionicons name="navigate-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>Enable location tracking to see your trips</Text>
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
