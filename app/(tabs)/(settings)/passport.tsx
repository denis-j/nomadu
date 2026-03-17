import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../../constants/colors';
import { useAuth } from '../../../hooks/useAuth';
import { getCitizenship, setCitizenship } from '../../../lib/onboarding';
import { searchCountries, getCountryCode, getCountryFlag } from '../../../utils/geography';
import { countryCodeToFlag } from '../../../lib/geocoding';

const hasGlass = isLiquidGlassAvailable();
const Glass = hasGlass ? GlassView : View;
const glassProps = hasGlass ? { glassEffectStyle: 'regular' as const } : {};

export default function PassportScreen() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [currentCountry, setCurrentCountry] = useState<string | null>(null);
  const [currentCode, setCurrentCode] = useState<string | null>(null);

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const code = getCountryCode(countryName);
    await setCitizenship(user.uid, countryName, code);
    setCurrentCountry(countryName);
    setCurrentCode(code);
    router.back();
  }, [user]);

  const renderItem = useCallback(({ item }: { item: string }) => {
    const flag = getCountryFlag(item) ?? '🏳️';
    const isSelected = item === currentCountry;

    return (
      <Pressable
        onPress={() => handleSelect(item)}
        style={({ pressed }) => pressed && styles.rowPressed}
      >
        <Glass {...glassProps} style={[styles.countryRow, !hasGlass && styles.countryRowFallback]}>
          <Text style={styles.flag}>{flag}</Text>
          <Text style={styles.countryName}>{item}</Text>
          {isSelected && (
            <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
          )}
        </Glass>
      </Pressable>
    );
  }, [currentCountry, handleSelect]);

  return (
    <View style={styles.container}>
      {/* Current passport */}
      {currentCountry && (
        <View style={styles.currentSection}>
          <Text style={styles.currentLabel}>Current passport</Text>
          <View style={styles.currentRow}>
            <Text style={styles.currentFlag}>
              {currentCode ? countryCodeToFlag(currentCode) : '🏳️'}
            </Text>
            <Text style={styles.currentCountry}>{currentCountry}</Text>
          </View>
        </View>
      )}

      {/* Search */}
      <Glass {...glassProps} style={[styles.searchBar, !hasGlass && styles.searchBarFallback]}>
        <Ionicons name="search" size={18} color={Colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search countries..."
          placeholderTextColor={Colors.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="words"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
          </Pressable>
        )}
      </Glass>

      {/* Country list */}
      <FlatList
        data={results}
        keyExtractor={(item) => item}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  currentSection: {
    gap: 6,
    paddingLeft: 4,
  },
  currentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  currentFlag: {
    fontSize: 28,
  },
  currentCountry: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  searchBarFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
    padding: 0,
  },
  list: {
    gap: 6,
    paddingBottom: 100,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    padding: 14,
    paddingHorizontal: 16,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  countryRowFallback: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowPressed: {
    opacity: 0.7,
  },
  flag: {
    fontSize: 24,
  },
  countryName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
});
