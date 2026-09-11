import { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import RNMapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { useJourney } from '../../../hooks/useJourney';

const MAP_PIN = require('../../../assets/icons/map-pin.png');

/**
 * The trip on a real map: pinch, pan, see where things are. The itinerary
 * screen only shows a picture; this is where a map earns its place.
 */
export default function JourneyMapScreen() {
  const params = useLocalSearchParams<{ journeyId: string }>();
  const { journey } = useJourney(Number(params.journeyId));
  const mapRef = useRef<RNMapView>(null);

  const coords = useMemo(
    () => (journey?.legs ?? [])
      .filter((l) => l.latitude != null && l.longitude != null)
      .map((l) => ({ latitude: l.latitude as number, longitude: l.longitude as number, city: l.city })),
    [journey?.legs],
  );

  const fit = () => {
    if (coords.length === 0) return;
    if (coords.length === 1) {
      mapRef.current?.animateToRegion({ ...coords[0], latitudeDelta: 1.2, longitudeDelta: 1.2 }, 0);
      return;
    }
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 80, bottom: 80, left: 60, right: 60 },
      animated: false,
    });
  };

  return (
    <>
      <Stack.Screen options={{ title: journey?.title ?? 'Map' }} />
      <View style={styles.container}>
        <RNMapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_DEFAULT}
          mapType="standard"
          onMapReady={fit}
        >
          {coords.length > 1 && (
            <Polyline coordinates={coords} strokeColor="rgba(0,0,0,0.45)" strokeWidth={1.5} lineDashPattern={[4, 6]} />
          )}
          {coords.map((c, i) => (
            <Marker key={i} coordinate={c} title={c.city} image={MAP_PIN} anchor={{ x: 0.5, y: 1 }} />
          ))}
        </RNMapView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
