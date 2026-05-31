import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  LinearTransition,
} from 'react-native-reanimated';
import AnimatedGradientBackground from '../../components/animated-gradient-background';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useAuth } from '../../hooks/useAuth';
import { setCitizenship } from '../../lib/onboarding';
import {
  getCountryCode,
  getPopularCountries,
  searchCountries,
} from '../../utils/geography';
import { Flag } from '../../components/Flag';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

const gradientColorSets = [
  {
    colors: ['#4DC1FF', '#8AD3FF', '#DBF0FF'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  {
    colors: ['#8AD3FF', '#DBF0FF', '#FFFFFF'],
    start: { x: 1, y: 0 },
    end: { x: 0, y: 1 },
  },
];

// Country coordinates for map pins
const COUNTRY_COORDS: Record<string, { latitude: number; longitude: number }> = {
  'Germany': { latitude: 51.16, longitude: 10.45 },
  'United States': { latitude: 39.83, longitude: -98.58 },
  'United Kingdom': { latitude: 55.37, longitude: -3.43 },
  'France': { latitude: 46.60, longitude: 1.89 },
  'Spain': { latitude: 40.46, longitude: -3.75 },
  'Italy': { latitude: 41.87, longitude: 12.57 },
  'Portugal': { latitude: 39.40, longitude: -8.22 },
  'Netherlands': { latitude: 52.13, longitude: 5.29 },
  'Austria': { latitude: 47.52, longitude: 14.55 },
  'Switzerland': { latitude: 46.82, longitude: 8.23 },
  'Thailand': { latitude: 15.87, longitude: 100.99 },
  'Japan': { latitude: 36.20, longitude: 138.25 },
  'Australia': { latitude: -25.27, longitude: 133.77 },
  'Canada': { latitude: 56.13, longitude: -106.35 },
  'Brazil': { latitude: -14.24, longitude: -51.93 },
  'Mexico': { latitude: 23.63, longitude: -102.55 },
  'Indonesia': { latitude: -0.79, longitude: 113.92 },
  'Croatia': { latitude: 45.10, longitude: 15.20 },
  'Greece': { latitude: 39.07, longitude: 21.82 },
  'Slovenia': { latitude: 46.15, longitude: 14.99 },
};

function SearchRow({ name, index, onPress }: {
  name: string; index: number; onPress: () => void;
}) {
  const code = getCountryCode(name);
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 30).duration(300)}
      layout={LinearTransition.springify()}
    >
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <Glass {...glassProps} style={[styles.searchRow, !hasGlass && styles.searchRowFallback]}>
          <View style={styles.searchFlagWrap}>
            <Flag code={code} size={22} />
          </View>
          <Text style={styles.searchName}>{name}</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </Glass>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function CitizenshipScreen() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const router = useRouter();
  const { user } = useAuth();
  const mapRef = useRef<MapView>(null);

  const isSearching = query.trim().length > 0;
  const popularCountries = useMemo(() => getPopularCountries(), []);
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    return searchCountries(query);
  }, [query, isSearching]);

  const handleSelect = useCallback(async (countryName: string) => {
    if (!user || selected) return;
    setSelected(countryName);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const code = getCountryCode(countryName);
    await setCitizenship(user.uid, countryName, code);
    router.push('/(onboarding)/residence');
  }, [user, selected, router]);

  const handleMarkerPress = (countryName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHoveredCountry(countryName);

    const coords = COUNTRY_COORDS[countryName];
    if (coords && mapRef.current) {
      mapRef.current.animateToRegion({
        ...coords,
        latitudeDelta: 15,
        longitudeDelta: 15,
      }, 500);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Map background */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          latitude: 30,
          longitude: 10,
          latitudeDelta: 100,
          longitudeDelta: 100,
        }}
        scrollEnabled={true}
        zoomEnabled={true}
        rotateEnabled={false}
        pitchEnabled={false}
        mapType="mutedStandard"
        userInterfaceStyle="light"
      >
        {popularCountries.map((name) => {
          const coords = COUNTRY_COORDS[name];
          if (!coords) return null;
          const code = getCountryCode(name);
          const isHovered = hoveredCountry === name;
          return (
            <Marker
              key={name}
              coordinate={coords}
              onPress={() => handleMarkerPress(name)}
            >
              <View style={[styles.markerWrap, isHovered && styles.markerWrapActive]}>
                {code && <Flag code={code} size={isHovered ? 22 : 18} />}
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Gradient overlay at top — pointerEvents none so map stays tappable */}
      <View style={styles.topGradient} pointerEvents="none">
        <AnimatedGradientBackground
          colorSets={[{
            colors: ['#4DC1FF', 'rgba(77, 193, 255, 0.7)', 'rgba(77, 193, 255, 0)'],
            start: { x: 0.5, y: 0 },
            end: { x: 0.5, y: 1 },
          }]}
          duration={8000}
        />
      </View>

      <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
        {/* Header + Search */}
        <View style={styles.topContent} pointerEvents="box-none">
          <Animated.View entering={FadeInUp.duration(500).springify()} style={styles.header}>
            <Text style={styles.title}>Where's home?</Text>
            <Text style={styles.subtitle}>Tap your country on the map</Text>
          </Animated.View>

          <Animated.View entering={FadeIn.delay(150).duration(400)} style={styles.searchWrap}>
            <Glass {...glassProps} style={[styles.searchBar, !hasGlass && styles.searchBarFallback]}>
              <Ionicons name="search" size={18} color={Colors.textTertiary} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search countries..."
                placeholderTextColor={Colors.textTertiary}
                autoCorrect={false}
              />
              {isSearching && (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
                </TouchableOpacity>
              )}
            </Glass>
          </Animated.View>

          {isSearching && (
            <FlatList
              data={searchResults.slice(0, 8)}
              renderItem={({ item, index }) => (
                <SearchRow name={item} index={index} onPress={() => handleSelect(item)} />
              )}
              keyExtractor={(item) => item}
              contentContainerStyle={styles.searchList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.emptyText}>No countries found</Text>
              }
            />
          )}
        </View>

        {/* Bottom card when a marker is tapped */}
        {hoveredCountry && !isSearching && !selected && (
          <Animated.View
            key={hoveredCountry}
            entering={FadeInDown.duration(350)}
            style={styles.bottomCard}
          >
            <TouchableOpacity
              onPress={() => handleSelect(hoveredCountry)}
              activeOpacity={0.8}
            >
              <Glass
                {...glassProps}
                style={[styles.confirmCard, !hasGlass && styles.confirmCardFallback]}
              >
                <View style={styles.confirmFlagWrap}>
                  <Flag code={getCountryCode(hoveredCountry)} size={32} />
                </View>
                <View style={styles.confirmTextWrap}>
                  <Text style={styles.confirmName}>{hoveredCountry}</Text>
                  <Text style={styles.confirmHint}>Tap to confirm</Text>
                </View>
                <View style={styles.confirmButton}>
                  <Ionicons name="checkmark" size={22} color="#FFF" />
                </View>
              </Glass>
            </TouchableOpacity>
          </Animated.View>
        )}
      </SafeAreaView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'space-between' },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.35,
  },
  topContent: {
    zIndex: 10,
  },
  header: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: {
    ...Typography.brandDisplay,
    fontSize: 40,
    marginBottom: 2,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  searchWrap: { paddingHorizontal: 20, marginBottom: 4 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    overflow: 'hidden',
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    gap: 10,
  },
  searchBarFallback: { backgroundColor: 'rgba(255, 255, 255, 0.9)', borderColor: Colors.border },
  searchInput: { ...Typography.titleSmall, fontWeight: '400', flex: 1 },
  searchList: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    overflow: 'hidden',
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  searchRowFallback: { backgroundColor: 'rgba(255, 255, 255, 0.92)', borderColor: Colors.border },
  searchFlagWrap: { marginRight: 12 },
  searchName: { ...Typography.titleSmall, fontWeight: '500', flex: 1 },
  emptyText: { ...Typography.titleSmall, fontWeight: '400', textAlign: 'center', color: Colors.textTertiary, marginTop: 20 },
  markerWrap: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 100,
    padding: 6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  markerWrapActive: {
    borderColor: Colors.primary,
    backgroundColor: '#fff',
    transform: [{ scale: 1.2 }],
  },
  bottomCard: {
    paddingHorizontal: 20,
    paddingBottom: 0,
  },
  confirmCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    overflow: 'hidden',
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  confirmCardFallback: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderColor: Colors.border },
  confirmFlagWrap: { marginRight: 14 },
  confirmTextWrap: { flex: 1 },
  confirmName: { ...Typography.titleMedium },
  confirmHint: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
  confirmButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
