import { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import RNMapView, { PROVIDER_DEFAULT } from 'react-native-maps';
import { cachedMapSnapshot, storeMapSnapshot } from '../../lib/mapSnapshot';

/** About a few streets around the pin. */
const DELTA = 0.012;

/**
 * Where a place is, as a still map with its pin: the cover of an activity
 * that has no picture of its own, in the same Apple map the trip opens
 * with. A live map is drawn once, photographed and cached (lib/mapSnapshot),
 * so a grid of them scrolls like a grid of pictures. The pin sits a little
 * above the middle, clear of the title laid over the bottom. It is drawn
 * over the map rather than as a map marker: the snapshotter put a black
 * square behind the marker's picture.
 */
export function PlaceMap({ latitude, longitude, style, lift = 0.18 }: { latitude: number; longitude: number; style?: StyleProp<ViewStyle>; lift?: number }) {
  const key = `place2:${latitude.toFixed(5)},${longitude.toFixed(5)}:${lift}`;
  const [snapshot, setSnapshot] = useState<string | null>(() => cachedMapSnapshot(key));
  const [ready, setReady] = useState(false);
  const mapRef = useRef<RNMapView>(null);
  const region = {
    latitude: latitude - DELTA * lift,
    longitude,
    latitudeDelta: DELTA,
    longitudeDelta: DELTA,
  };

  useEffect(() => {
    if (!ready || snapshot) return;
    const t = setTimeout(async () => {
      try {
        const path = await mapRef.current?.takeSnapshot({ region, format: 'png', quality: 1, result: 'file' });
        if (path) setSnapshot(storeMapSnapshot(key, path));
      } catch {
        // The live map stays; it only costs more to scroll.
      }
    }, 400);
    return () => clearTimeout(t);
    // region follows from key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, snapshot, key]);

  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      {snapshot ? (
        <Image source={{ uri: snapshot }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <RNMapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_DEFAULT}
          initialRegion={region}
          {...(Platform.OS === 'android' ? { onMapLoaded: () => setReady(true) } : { onMapReady: () => setReady(true) })}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          showsPointsOfInterests
          mapType="standard"
        />
      )}
      {/* The place is `lift` of the map's height above its centre. */}
      <View style={[styles.pin, { top: `${50 - lift * 100}%` }]}>
        <View style={styles.pinDot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#E9EEF2' },
  pin: {
    position: 'absolute',
    left: '50%',
    width: 22,
    height: 22,
    marginLeft: -11,
    marginTop: -11,
    borderRadius: 11,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  pinDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#000' },
});
