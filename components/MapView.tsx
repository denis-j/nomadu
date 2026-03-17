import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import RNMapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Trip } from '../lib/database';
import { mapState } from '../lib/mapState';
import { Colors } from '../constants/colors';

interface CityMarker {
  key: string;
  city: string;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
  totalDays: number;
  tripId: number;
}

interface MapViewProps {
  trips: Trip[];
}

export function MapView({ trips }: MapViewProps) {
  const mapRef = useRef<RNMapView>(null);
  const markerRefs = useRef<Map<string, any>>(new Map());
  const selectedKeyRef = useRef<string | null>(null);

  // Register deselect function so city screen can call it on unmount
  useEffect(() => {
    mapState.deselectPin = () => {
      if (selectedKeyRef.current) {
        markerRefs.current.get(selectedKeyRef.current)?.hideCallout();
        selectedKeyRef.current = null;
      }
    };
    return () => { mapState.deselectPin = null; };
  }, []);

  const markers = useMemo<CityMarker[]>(() => {
    const map = new Map<string, CityMarker>();
    for (const trip of trips) {
      if (!trip.latitude || !trip.longitude) continue;
      const key = `${trip.city.toLowerCase()}-${trip.country_code}`;
      const existing = map.get(key);
      if (existing) {
        existing.totalDays += trip.days;
      } else {
        map.set(key, {
          key,
          city: trip.city,
          country: trip.country,
          country_code: trip.country_code,
          latitude: trip.latitude,
          longitude: trip.longitude,
          totalDays: trip.days,
          tripId: trip.id,
        });
      }
    }
    return Array.from(map.values());
  }, [trips]);

  const handleMarkerSelect = useCallback((marker: CityMarker) => {
    selectedKeyRef.current = marker.key;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/city/${marker.city}::${marker.country_code}`);
  }, []);

  const initialRegion =
    markers.length > 0
      ? {
          latitude: markers[0].latitude,
          longitude: markers[0].longitude,
          latitudeDelta: 40,
          longitudeDelta: 40,
        }
      : {
          latitude: 30,
          longitude: 0,
          latitudeDelta: 100,
          longitudeDelta: 100,
        };

  return (
    <View style={styles.container}>
      <RNMapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        showsUserLocation
        showsCompass
        showsScale
        mapType="standard"
      >
        {markers.map((marker) => (
          <Marker
            key={marker.key}
            ref={(r) => { if (r) markerRefs.current.set(marker.key, r); }}
            coordinate={{
              latitude: marker.latitude,
              longitude: marker.longitude,
            }}
            onSelect={() => handleMarkerSelect(marker)}
          />
        ))}
      </RNMapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});
