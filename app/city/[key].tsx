import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import RNMapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getTripsByCity, Trip } from '../../lib/database';
import { countryCodeToFlag } from '../../lib/geocoding';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { mapState } from '../../lib/mapState';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

export default function CityDetailScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  // key format: "city::countryCode"
  const [city, countryCode] = (key ?? '').split('::');

  useEffect(() => {
    if (city && countryCode) {
      getTripsByCity(city, countryCode).then((result) => {
        setTrips(result);
        setLoading(false);
      });
    }
  }, [city, countryCode]);

  // Deselect map pin when sheet is dismissed
  useEffect(() => {
    return () => { mapState.deselectPin?.(); };
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const flag = countryCodeToFlag(countryCode);
  const country = trips[0]?.country ?? '';
  const totalDays = trips.reduce((sum, t) => sum + t.days, 0);
  const totalVisits = trips.length;
  const coordTrip = trips.find((t) => t.latitude && t.longitude);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={styles.content}
      >
        {/* Hero Map */}
        {coordTrip?.latitude && coordTrip?.longitude && (
          <View style={styles.mapContainer}>
            <RNMapView
              style={styles.map}
              provider={PROVIDER_DEFAULT}
              initialRegion={{
                latitude: coordTrip.latitude,
                longitude: coordTrip.longitude,
                latitudeDelta: 0.4,
                longitudeDelta: 0.4,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              <Marker
                coordinate={{
                  latitude: coordTrip.latitude,
                  longitude: coordTrip.longitude,
                }}
              />
            </RNMapView>
            <Glass
              {...glassProps}
              style={[styles.mapOverlay, !hasGlass && styles.mapOverlayFallback]}
            >
              <Text style={styles.heroFlag}>{flag}</Text>
            </Glass>
          </View>
        )}

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.city}>{city}</Text>
          <Text style={styles.country}>{country}</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Glass {...glassProps} style={[styles.statCard, !hasGlass && styles.statCardFallback]}>
            <Text style={styles.statLabel}>Visits</Text>
            <Text style={styles.statValue}>{totalVisits}</Text>
          </Glass>
          <Glass {...glassProps} style={[styles.statCard, !hasGlass && styles.statCardFallback]}>
            <Text style={styles.statLabel}>Total Days</Text>
            <Text style={styles.statValue}>{totalDays}</Text>
          </Glass>
        </View>

        {/* Timeline */}
        <View style={styles.timelineSection}>
          <Text style={styles.timelineTitle}>Visit History</Text>
          <View style={styles.timeline}>
            <View style={styles.timelineLine} />
            {trips.map((trip, index) => {
              const isActive = !trip.end_date;
              const dateRange = trip.end_date
                ? `${formatDate(trip.start_date)} – ${formatDate(trip.end_date)}`
                : `${formatDate(trip.start_date)} – Present`;

              return (
                <TouchableOpacity
                  key={trip.id}
                  style={styles.timelineItem}
                  activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/trip/${trip.id}`);
                  }}
                >
                  <View style={styles.timelineDotCol}>
                    <View style={[styles.timelineDot, isActive && styles.timelineDotActive]} />
                  </View>
                  <Glass
                    {...glassProps}
                    style={[styles.timelineCard, !hasGlass && styles.timelineCardFallback]}
                  >
                    <View style={styles.timelineCardTop}>
                      <Text style={styles.visitNumber}>Visit {index + 1}</Text>
                      <View style={styles.daysBadge}>
                        <Text style={styles.daysText}>{trip.days}d</Text>
                      </View>
                    </View>
                    <Text style={styles.dateRange}>{dateRange}</Text>
                    {isActive && (
                      <View style={styles.activeBadge}>
                        <View style={styles.activeDot} />
                        <Text style={styles.activeText}>Currently here</Text>
                      </View>
                    )}
                  </Glass>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </>
  );
}

const DOT_SIZE = 12;
const TIMELINE_COL = 28;

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...Typography.titleSmall,
    fontWeight: '400',
    color: Colors.textSecondary,
  },
  content: {
    paddingBottom: 60,
  },
  // ─── Map ───
  mapContainer: {
    height: 220,
    borderRadius: 20,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginTop: 24,
    borderCurve: 'continuous',
  },
  map: {
    flex: 1,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  mapOverlayFallback: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  heroFlag: {
    fontSize: 32,
  },
  // ─── Header ───
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 4,
    gap: 2,
  },
  city: {
    ...Typography.displayMedium,
    fontSize: 26,
    fontWeight: '700',
  },
  country: {
    ...Typography.titleSmall,
    fontWeight: '400',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  // ─── Stats ───
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 20,
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    gap: 4,
    overflow: 'hidden',
  },
  statCardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  statValue: {
    ...Typography.displayMedium,
    fontVariant: ['tabular-nums'],
  },
  // ─── Timeline ───
  timelineSection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  timelineTitle: {
    ...Typography.button,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  timeline: {
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: TIMELINE_COL / 2 - 1,
    width: 2,
    backgroundColor: Colors.primary + '30',
  },
  timelineItem: {
    flexDirection: 'row',
  },
  timelineDotCol: {
    width: TIMELINE_COL,
    alignItems: 'center',
    paddingTop: 16,
  },
  timelineDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.background,
    zIndex: 1,
  },
  timelineDotActive: {
    backgroundColor: Colors.primary,
    borderWidth: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  timelineCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    overflow: 'hidden',
  },
  timelineCardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timelineCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  visitNumber: {
    ...Typography.button,
  },
  daysBadge: {
    backgroundColor: Colors.primary + '18',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  daysText: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.primary,
  },
  dateRange: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  activeText: {
    ...Typography.caption,
    fontWeight: '600',
    color: Colors.success,
  },
});
