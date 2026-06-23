import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, PlatformColor, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { Typography } from '../../../constants/typography';
import { useAuth } from '../../../hooks/useAuth';
import { getCitizenship, setCitizenship } from '../../../lib/onboarding';
import { searchCountries, getCountryCode, getCountryNames, getPopularCountries } from '../../../utils/geography';
import { Flag } from '../../../components/Flag';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const EXPANDED_WIDTH = SCREEN_WIDTH - 32;
const hasGlass = isLiquidGlassAvailable();
const OPEN_CONFIG = { duration: 400, easing: Easing.bezier(0.4, 0, 0.2, 1) };
const CLOSE_CONFIG = { duration: 400, easing: Easing.bezier(0.4, 0, 0.2, 1) };

export default function PassportScreen() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [currentCountry, setCurrentCountry] = useState<string | null>(null);
  const [currentCode, setCurrentCode] = useState<string | null>(null);

  // Morph chip state
  const [chipWidth, setChipWidth] = useState(0);

  // Track the keyboard so the floating chip stays visible while the user
  // is typing. iOS reports the height inclusive of the system accessory bar,
  // so we just add it to the chip's bottom offset.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const [rowHeight, setRowHeight] = useState(0);
  const [inputHeight, setInputHeight] = useState(0);
  const progress = useSharedValue(0);
  const isExpanded = useSharedValue(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!user) return;
    getCitizenship(user.uid).then((c) => {
      if (c) {
        setCurrentCountry(c.country);
        setCurrentCode(c.countryCode);
      }
    });
  }, [user]);

  // When idle: show Popular block + full A-Z list. When searching: filtered.
  const isSearching = query.trim().length > 0;
  const popularList = getPopularCountries();
  const allCountriesSorted = (() => {
    if (isSearching) return [];
    const popularSet = new Set(popularList);
    return getCountryNames()
      .filter((c) => !popularSet.has(c))
      .sort((a, b) => a.localeCompare(b));
  })();
  const searchResults = isSearching ? searchCountries(query) : [];

  const handleSelect = useCallback(async (countryName: string) => {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const code = getCountryCode(countryName);
    await setCitizenship(user.uid, countryName, code);
    setCurrentCountry(countryName);
    setCurrentCode(code);
    router.back();
  }, [user]);

  const focusInput = () => inputRef.current?.focus();
  const blurInput = () => { inputRef.current?.blur(); setQuery(''); };

  const handleChipPress = () => {
    const next = !isExpanded.value;
    isExpanded.value = next;
    if (next) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      progress.value = withTiming(1, OPEN_CONFIG, () => runOnJS(focusInput)());
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      runOnJS(blurInput)();
      progress.value = withTiming(0, CLOSE_CONFIG);
    }
  };

  const PAD = 28; // paddingVertical 14 * 2
  const collapsedH = rowHeight > 0 ? rowHeight + PAD : 0;
  const expandedH = rowHeight > 0 && inputHeight > 0 ? rowHeight + inputHeight + PAD : 0;

  const containerStyle = useAnimatedStyle(() => ({
    width: chipWidth > 0
      ? interpolate(progress.value, [0, 1], [chipWidth, EXPANDED_WIDTH])
      : undefined,
    borderRadius: interpolate(progress.value, [0, 1], [100, 22]),
    height: collapsedH > 0 && expandedH > 0
      ? interpolate(progress.value, [0, 1], [collapsedH, expandedH])
      : undefined,
    overflow: 'hidden' as const,
  }));

  const inputOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.4, 1], [0, 1]),
  }));

  return (
    <View style={styles.root}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.list}
      >
        {/* Current passport */}
        {currentCountry && (
          <View style={styles.currentSection}>
            {currentCode ? <Flag code={currentCode} size={32} /> : null}
            <View style={styles.currentInfo}>
              <Text style={styles.currentLabel}>Current passport</Text>
              <Text style={styles.currentCountry}>{currentCountry}</Text>
            </View>
          </View>
        )}

        {/* Country list */}
        {isSearching ? (
          <>
            {searchResults.map((name, i) => (
              <CountryRow
                key={`s-${name}-${i}`}
                name={name}
                isSelected={name === currentCountry}
                onPress={() => handleSelect(name)}
              />
            ))}
            {searchResults.length === 0 && (
              <Text style={styles.empty}>No countries found</Text>
            )}
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Popular</Text>
            {popularList.map((name, i) => (
              <CountryRow
                key={`p-${name}-${i}`}
                name={name}
                isSelected={name === currentCountry}
                onPress={() => handleSelect(name)}
              />
            ))}
            <Text style={styles.sectionLabel}>All countries</Text>
            {allCountriesSorted.map((name, i) => (
              <CountryRow
                key={`a-${name}-${i}`}
                name={name}
                isSelected={name === currentCountry}
                onPress={() => handleSelect(name)}
              />
            ))}
          </>
        )}
      </ScrollView>

      {/* Floating morph chip — sits above the tab bar when idle, snaps to
          just above the keyboard when typing (no doubled-up cushion). */}
      <View
        style={[
          styles.chipContainer,
          { bottom: keyboardHeight > 0 ? keyboardHeight + 12 : 100 },
        ]}
      >
        <Pressable onPress={handleChipPress}>
          <Animated.View
            style={[styles.morphContainer, containerStyle]}
            onLayout={(e) => {
              if (chipWidth === 0) setChipWidth(e.nativeEvent.layout.width);
            }}
          >
            {hasGlass ? (
              <GlassView glassEffectStyle="regular" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.morphFallback]} />
            )}

            {/* Collapsed chip row */}
            <View
              style={styles.chipRow}
              onLayout={(e) => {
                if (rowHeight === 0) setRowHeight(e.nativeEvent.layout.height);
              }}
            >
              <Ionicons name="search" size={16} color={Colors.textSecondary} />
              <Text style={styles.chipText}>Search countries</Text>
            </View>

            {/* Expanded input */}
            <Animated.View
              style={[styles.inputSection, inputOpacity]}
              onLayout={(e) => {
                if (inputHeight === 0) setInputHeight(e.nativeEvent.layout.height);
              }}
            >
              <View style={styles.expandDivider} />
              <View style={styles.inputRow}>
                <Ionicons name="search" size={18} color={Colors.textTertiary} />
                <TextInput
                  ref={inputRef}
                  style={styles.searchInput}
                  placeholder="Type a country name…"
                  placeholderTextColor={Colors.textTertiary}
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  autoCapitalize="words"
                  returnKeyType="search"
                />
                {query.length > 0 && (
                  <Pressable onPress={() => { setQuery(''); inputRef.current?.focus(); }} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
                  </Pressable>
                )}
              </View>
            </Animated.View>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  list: {
    // Enough room that the last country row clears the floating chip and the
    // tab bar below it. The chip sits at bottom: 100 and is ~60pt tall, so
    // a 200pt cushion gives breathing room.
    paddingBottom: 200,
  },
  currentSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor('separator'),
  },
  currentInfo: {
    gap: 2,
  },
  currentLabel: {
    fontSize: 13,
    color: PlatformColor('secondaryLabel'),
  },
  currentCountry: {
    fontSize: 18,
    fontWeight: '700',
    color: PlatformColor('label'),
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor('separator'),
  },
  itemPressed: {
    backgroundColor: PlatformColor('systemGray5'),
  },
  itemText: {
    flex: 1,
    fontSize: 16,
    color: PlatformColor('label'),
  },
  empty: {
    textAlign: 'center',
    color: PlatformColor('tertiaryLabel'),
    paddingTop: 40,
    fontSize: 15,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: PlatformColor('secondaryLabel'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  // ─── Morph Chip ───
  chipContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  morphContainer: {
    overflow: 'hidden',
    paddingVertical: 14,
    paddingHorizontal: 18,
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
    justifyContent: 'center',
    gap: 8,
  },
  chipText: {
    ...Typography.button,
  },
  inputSection: {},
  expandDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginTop: 12,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    ...Typography.titleSmall,
    fontWeight: '400',
    flex: 1,
    padding: 0,
  },
});

function CountryRow({
  name,
  isSelected,
  onPress,
}: {
  name: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  const code = getCountryCode(name);
  return (
    <Pressable
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
      onPress={onPress}
    >
      <Flag code={code} size={22} />
      <Text style={styles.itemText}>{name}</Text>
      {isSelected && (
        <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
      )}
    </Pressable>
  );
}
