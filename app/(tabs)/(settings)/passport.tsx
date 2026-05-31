import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, PlatformColor, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { searchCountries, getCountryCode, getCountryFlag } from '../../../utils/geography';
import { countryCodeToFlag } from '../../../lib/geocoding';

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

  const results = searchCountries(query);

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
            <Text style={styles.currentFlag}>
              {currentCode ? countryCodeToFlag(currentCode) : '🏳️'}
            </Text>
            <View style={styles.currentInfo}>
              <Text style={styles.currentLabel}>Current passport</Text>
              <Text style={styles.currentCountry}>{currentCountry}</Text>
            </View>
          </View>
        )}

        {/* Country list */}
        {results.map((name, i) => {
          const flag = getCountryFlag(name) ?? '🏳️';
          const isSelected = name === currentCountry;

          return (
            <Pressable
              key={`${name}-${i}`}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              onPress={() => handleSelect(name)}
            >
              <Text style={styles.flag}>{flag}</Text>
              <Text style={styles.itemText}>{name}</Text>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              )}
            </Pressable>
          );
        })}

        {results.length === 0 && (
          <Text style={styles.empty}>No countries found</Text>
        )}
      </ScrollView>

      {/* Floating morph chip */}
      <View style={styles.chipContainer}>
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
    paddingBottom: 160,
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
  currentFlag: {
    fontSize: 36,
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
  flag: {
    fontSize: 24,
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
