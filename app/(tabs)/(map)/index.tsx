import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, Text, View } from 'react-native';
import RNMapView, { PROVIDER_DEFAULT } from 'react-native-maps';
import { MapView } from '../../../components/MapView';
import { useTrips } from '../../../hooks/useTrips';
import { Colors } from '../../../constants/colors';
import { countryCodeToFlag } from '../../../lib/geocoding';

const hasGlass = isLiquidGlassAvailable();

const ChipWrapper = hasGlass ? GlassView : View;
const chipGlassProps = hasGlass
  ? { glassEffectStyle: 'regular' as const }
  : {};

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
          <ChipWrapper
            {...chipGlassProps}
            style={[styles.chip, !hasGlass && styles.chipFallback]}
          >
            <Text style={styles.chipFlag}>
              {countryCodeToFlag(currentTrip.country_code)}
            </Text>
            <Text style={styles.chipCity}>{currentTrip.city}</Text>
            <View style={styles.chipDivider} />
            <Text style={styles.chipCountry}>{currentTrip.country}</Text>
          </ChipWrapper>
        ) : !loading ? (
          <ChipWrapper
            {...chipGlassProps}
            style={[styles.chip, !hasGlass && styles.chipFallback]}
          >
            <Ionicons name="navigate-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>
              Enable location tracking to see your trips
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
    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.12)',
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
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
