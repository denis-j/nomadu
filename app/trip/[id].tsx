import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import RNMapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getMergedTripContaining, markTripGroupDeleted, parseDate, Trip } from '../../lib/database';
import { MissingRoute } from '../../components/MissingRoute';
import { useTranslation } from '../../contexts/LanguageContext';
import { reportError } from '../../lib/monitoring';
import { showToast } from '../../lib/toast';
import { Flag } from '../../components/Flag';
import { SectionLabel } from '../../components/visaForm';
import { StatRow, StatTile } from '../../components/StatTile';
import { Colors } from '../../constants/colors';
import { Typography, FontSize } from '../../constants/typography';
import { appLocale } from '../../lib/i18n/locale';

const hasGlass = isLiquidGlassAvailable();
const GlassCard = hasGlass ? GlassView : View;

export default function TripDetailScreen() {
  const { t, countryName } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  // undefined while loading, null when there is no such trip (deleted, or a
  // link with a made-up id), which used to leave "Loading..." up for good.
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);

  useEffect(() => {
    const rowId = Number(id);
    if (!id || !Number.isFinite(rowId)) {
      setTrip(null);
      return;
    }
    // The whole stay the timeline showed, not just its first row.
    getMergedTripContaining(rowId).then(setTrip).catch(() => setTrip(null));
  }, [id]);

  if (trip === null) {
    return <MissingRoute title={t('tripEntry.trip')} message={t('tripEntry.gone')} />;
  }

  if (!trip) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  const isActive = !trip.end_date;

  // Day and month only: a third of the width cannot hold "Aug 26, 2026" and
  // cut it to "Aug 26,…". The year is on the Arrival and Departure rows
  // right below, spelled out in full.
  const formatDate = (dateStr: string) =>
    parseDate(dateStr).toLocaleDateString(appLocale(), {
      month: 'short',
      day: 'numeric',
    });

  const formatDateLong = (dateStr: string) =>
    parseDate(dateStr).toLocaleDateString(appLocale(), {
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
      <View
        style={styles.content}
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
              <Flag code={trip.country_code} size={28} />
            </GlassCard>
          </View>
        )}

        {/* City & Country */}
        <View style={[styles.header, styles.headerWithMap]}>
          <Text style={styles.city}>{trip.city}</Text>
          <Text style={styles.country}>{countryName(trip.country)}</Text>
          {isActive && (
            <View style={styles.activeBadge}>
              <View style={styles.activeDot} />
              <Text style={styles.activeText}>{t('tripEntry.currentlyHere')}</Text>
            </View>
          )}
        </View>

        {/* Stats Row */}
        <StatRow style={styles.statsRow}>
          <StatTile label={t('tripEntry.duration')} value={`${trip.days}`} unit={trip.days === 1 ? t('tripEntry.day') : t('tripEntry.days')} />
          <StatTile label={t('tripEntry.arrived')} value={formatDate(trip.start_date)} />
          <StatTile label={isActive ? t('tripEntry.status') : t('tripEntry.departed')} value={isActive ? t('tripEntry.active') : formatDate(trip.end_date!)} />
        </StatRow>

        {/* Details Card, its label above it as on the stop sheet */}
        <View style={styles.section}>
          <SectionLabel>{t('tripEntry.tripDetails')}</SectionLabel>
          <GlassCard
            {...glassProps}
            style={[styles.detailsCard, !hasGlass && styles.detailsCardFallback]}
          >
            <DetailRow icon="log-in-outline" label={t('tripEntry.arrival')} value={formatDateLong(trip.start_date)} />
            <View style={styles.separator} />
            <DetailRow icon="log-out-outline" label={t('tripEntry.departure')} value={trip.end_date ? formatDateLong(trip.end_date) : t('tripEntry.ongoing')} />
            <View style={styles.separator} />
            <DetailRow icon="time-outline" label={t('tripEntry.totalDays')} value={trip.days === 1 ? t('tripEntry.daysOne', { count: trip.days }) : t('tripEntry.daysMany', { count: trip.days })} />
            {trip.latitude && trip.longitude && (
              <>
                <View style={styles.separator} />
                <DetailRow icon="navigate-outline" label={t('tripEntry.coordinates')} value={`${trip.latitude.toFixed(4)}, ${trip.longitude.toFixed(4)}`} />
              </>
            )}
          </GlassCard>
        </View>

        {/* Delete */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() =>
            Alert.alert(t('tripEntry.deleteEntry'), t('tripEntry.removeTitle', { city: trip.city, country: trip.country }), [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('common.delete'),
                style: 'destructive',
                onPress: async () => {
                  // A tombstone for every merged row: removing the row outright
                  // let the next sync pull it straight back from the cloud.
                  try {
                    await markTripGroupDeleted(trip.id);
                    router.back();
                  } catch (err) {
                    reportError(err, 'trip:delete');
                    showToast(t('tripEntry.couldNotDelete'), 'error');
                  }
                },
              },
            ])
          }
          activeOpacity={0.5}
        >
          <Text style={styles.deleteText}>{t('tripEntry.deleteEntry')}</Text>
        </TouchableOpacity>
      </View>
    </>
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
    ...Typography.titleSmall,
    fontWeight: '400',
    color: Colors.textSecondary,
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
    ...Typography.displayMedium,
    fontSize: FontSize.title1,
    fontWeight: '700',
  },
  country: {
    ...Typography.titleSmall,
    fontWeight: '400',
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
    ...Typography.bodySmall,
    fontWeight: '600',
    color: Colors.success,
  },
  // ─── Stats Row ───
  statsRow: {
    marginHorizontal: 16,
    marginTop: 20,
  },
  // ─── Details Card ───
  section: {
    marginHorizontal: 16,
    marginTop: 16,
    gap: 10,
  },
  detailsCard: {
    borderRadius: 16,
    padding: 18,
    overflow: 'hidden',
  },
  detailsCardFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
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
    ...Typography.bodySmall,
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
  },
  detailValue: {
    ...Typography.bodySmall,
    fontSize: FontSize.subheadline,
    fontWeight: '500',
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
    ...Typography.bodyMedium,
    color: Colors.error,
  },
});
