import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import RNMapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import { deleteTrip, getTripById, Trip } from '../../lib/database';
import { countryCodeToFlag } from '../../lib/geocoding';
import { Colors } from '../../constants/colors';

const hasGlass = isLiquidGlassAvailable();
const GlassCard = hasGlass ? GlassView : View;

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);

  useEffect(() => {
    if (id) {
      getTripById(Number(id)).then(setTrip);
    }
  }, [id]);

  if (!trip) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const flag = countryCodeToFlag(trip.country_code);
  const isActive = !trip.end_date;

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const formatDateLong = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

  const glassProps = hasGlass
    ? { glassEffectStyle: 'regular' as const }
    : {};

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Hero Map */}
        {trip.latitude && trip.longitude && (
          <View style={styles.mapContainer}>
            <RNMapView
              style={styles.map}
              provider={PROVIDER_DEFAULT}
              initialRegion={{
                latitude: trip.latitude,
                longitude: trip.longitude,
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
                  latitude: trip.latitude,
                  longitude: trip.longitude,
                }}
              />
            </RNMapView>

            {/* Flag overlay on map */}
            <GlassCard
              {...glassProps}
              style={[styles.mapOverlay, !hasGlass && styles.mapOverlayFallback]}
            >
              <Text style={styles.heroFlag}>{flag}</Text>
            </GlassCard>
          </View>
        )}

        {/* City & Country */}
        <View style={[styles.header, styles.headerWithMap]}>
          <Text style={styles.city}>{trip.city}</Text>
          <Text style={styles.country}>{trip.country}</Text>
          {isActive && (
            <View style={styles.activeBadge}>
              <View style={styles.activeDot} />
              <Text style={styles.activeText}>Currently here</Text>
            </View>
          )}
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatCard label="Duration" value={`${trip.days}`} unit={trip.days === 1 ? 'day' : 'days'} />
          <StatCard label="Arrived" value={formatDate(trip.start_date)} />
          <StatCard label={isActive ? 'Status' : 'Departed'} value={isActive ? 'Active' : formatDate(trip.end_date!)} />
        </View>

        {/* Details Card */}
        <GlassCard
          {...glassProps}
          style={[styles.detailsCard, !hasGlass && styles.detailsCardFallback]}
        >
          <Text style={styles.detailsTitle}>Trip Details</Text>

          <DetailRow icon="log-in-outline" label="Arrival" value={formatDateLong(trip.start_date)} />
          <View style={styles.separator} />
          <DetailRow icon="log-out-outline" label="Departure" value={trip.end_date ? formatDateLong(trip.end_date) : 'Ongoing'} />
          <View style={styles.separator} />
          <DetailRow icon="time-outline" label="Total Days" value={`${trip.days} day${trip.days !== 1 ? 's' : ''}`} />
          {trip.latitude && trip.longitude && (
            <>
              <View style={styles.separator} />
              <DetailRow icon="navigate-outline" label="Coordinates" value={`${trip.latitude.toFixed(4)}, ${trip.longitude.toFixed(4)}`} />
            </>
          )}
        </GlassCard>

        {/* Delete */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() =>
            Alert.alert('Delete Trip', `Remove ${trip.city}, ${trip.country}?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await deleteTrip(trip.id);
                  router.back();
                },
              },
            ])
          }
          activeOpacity={0.5}
        >
          <Text style={styles.deleteText}>Delete Trip</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}

function StatCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  const glassProps = hasGlass
    ? { glassEffectStyle: 'regular' as const }
    : {};

  return (
    <GlassCard
      {...glassProps}
      style={[styles.statCard, !hasGlass && styles.statCardFallback]}
    >
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>
        {value}
        {unit && <Text style={styles.statUnit}> {unit}</Text>}
      </Text>
    </GlassCard>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailLeft}>
        <Ionicons name={icon} size={18} color={Colors.textTertiary} />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text selectable style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
  content: {
    paddingBottom: 60,
  },
  // ─── Hero Map ───
  mapContainer: {
    height: 240,
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
    paddingBottom: 4,
    gap: 2,
  },
  headerWithMap: {
    paddingTop: 20,
  },
  city: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.text,
  },
  country: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '18',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginTop: 10,
    gap: 6,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  activeText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.success,
  },
  // ─── Stats Row ───
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
  statValue: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  statUnit: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textTertiary,
    marginBottom: 2,
  },
  // ─── Details Card ───
  detailsCard: {
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 18,
    overflow: 'hidden',
  },
  detailsCardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  // ─── Delete ───
  deleteButton: {
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 14,
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.error,
  },
});
