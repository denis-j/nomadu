import { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import RNMapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { cachedMapSnapshot, storeMapSnapshot } from '../../lib/mapSnapshot';

const MAP_PIN = require('../../assets/icons/map-pin.png');

export type MapPin = { latitude: number; longitude: number };

/** A city and its surroundings, when the one pin is a stop rather than a place. */
export const CITY_SPAN = 0.4;
/** A few streets around a single place. */
export const PLACE_SPAN = 0.012;

/**
 * Several places on one still map: the things to do at a stop, or the
 * trip's stops when none of them is placed yet. Drawn once by the live
 * map and photographed (lib/mapSnapshot), with the same pin as the trip's
 * route map; from then on it is a picture and scrolls like one. A new set
 * of pins gets a new picture.
 */
export function PinsMap({ pins, singleSpan = PLACE_SPAN, style }: { pins: MapPin[]; singleSpan?: number; style?: StyleProp<ViewStyle> }) {
  const key = `pins1:${singleSpan}:${pins.map((p) => `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`).sort().join('|')}`;
  const [snapshot, setSnapshot] = useState<string | null>(() => cachedMapSnapshot(key));
  const [ready, setReady] = useState(false);
  const mapRef = useRef<RNMapView>(null);

  // Other pins in the same frame: the old picture must not stay up.
  const [shownFor, setShownFor] = useState(key);
  if (shownFor !== key) {
    setShownFor(key);
    setSnapshot(cachedMapSnapshot(key));
    setReady(false);
  }

  const region = regionFor(pins, singleSpan);

  useEffect(() => {
    if (!ready || snapshot || !region) return;
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

  if (!region) return <View style={[styles.wrap, style]} />;

  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      {snapshot ? (
        <Image source={{ uri: snapshot }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <RNMapView
          // A fresh map per set of pins: `initialRegion` is read once.
          key={key}
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_DEFAULT}
          initialRegion={region}
          {...(Platform.OS === 'android' ? { onMapLoaded: () => setReady(true) } : { onMapReady: () => setReady(true) })}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          mapType="standard"
        >
          {pins.map((p, i) => (
            // Own pin image: the snapshotter draws images cleanly, while
            // Apple's balloon annotation comes out as a black square.
            <Marker key={i} coordinate={p} image={MAP_PIN} anchor={{ x: 0.5, y: 1 }} />
          ))}
        </RNMapView>
      )}
    </View>
  );
}

/** The span that holds every pin with room around it; one pin gets the span the caller asked for. */
function regionFor(pins: MapPin[], singleSpan: number) {
  if (pins.length === 0) return null;
  if (pins.length === 1) {
    return { latitude: pins[0].latitude, longitude: pins[0].longitude, latitudeDelta: singleSpan, longitudeDelta: singleSpan };
  }
  const lats = pins.map((p) => p.latitude);
  const lngs = pins.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(PLACE_SPAN, (maxLat - minLat) * 1.8),
    longitudeDelta: Math.max(PLACE_SPAN, (maxLng - minLng) * 1.8),
  };
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#E9EEF2' },
});
