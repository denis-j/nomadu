import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors, systemColor } from '../constants/colors';
import { Flag } from './Flag';
import { getCountryCode, getCountryNames, getPopularCountries, searchCountries } from '../utils/geography';
import { useTranslation } from '../contexts/LanguageContext';
import { Typography, FontSize } from '../constants/typography';

const popularCountries = getPopularCountries();

interface CountryPickerProps {
  /**
   * Search query, owned by the consumer so it can live in the native
   * `headerSearchBarOptions` of the host screen instead of in the body.
   * Pass `''` (empty) to show the popular list.
   */
  query: string;
  /** Called when the user taps a country row. */
  onSelect: (name: string, code: string) => void;
  /** Show the curated popular list when `query` is empty. Defaults to true. */
  showPopularWhenEmpty?: boolean;
  /** Section heading shown above the popular list. */
  popularLabel?: string;
  /** English name of the country already chosen: its row gets a checkmark instead of a chevron. */
  selected?: string | null;
}

/**
 * Reusable iOS-native country picker body. Render inside a Stack screen that
 * wires the search bar via `headerSearchBarOptions` and forwards onChangeText
 * to this component's `query` prop. The picker itself is pure presentation,
 * the host owns search state and the selection callback.
 *
 * Visual style: white sheet background, hairline-separated rows, native
 * PlatformColor tokens (Dark Mode + Liquid Glass safe). Pattern originated on
 * `(timeline)/create/country.tsx`.
 */
export function CountryPicker({
  query,
  onSelect,
  showPopularWhenEmpty = true,
  popularLabel,
  selected,
}: CountryPickerProps) {
  const { t, countryName } = useTranslation();
  const trimmed = query.trim();
  const isSearching = trimmed.length > 0;

  // Idle view shows a curated Popular block on top + the full A-Z list below
  // so the user can browse the entire ~250-country catalogue without having
  // to type. Cheap memo, getCountryNames is itself cached.
  const allCountriesSorted = useMemo(() => {
    const popularSet = new Set(popularCountries);
    return getCountryNames()
      .filter((c) => !popularSet.has(c))
      .sort((a, b) => countryName(a).localeCompare(countryName(b)));
  }, [countryName]);

  // Match the query against the English name (with aliases) and the localised
  // name, so searching works in either language.
  const searchMatches = (q: string) => {
    const eng = searchCountries(q);
    const seen = new Set(eng);
    const ql = q.trim().toLowerCase();
    const de = getCountryNames().filter((c) => !seen.has(c) && countryName(c).toLowerCase().includes(ql));
    return [...eng, ...de];
  };

  const renderRow = (name: string) => {
    const code = getCountryCode(name);
    return (
      <Pressable
        key={name}
        style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
        onPress={() => onSelect(name, code)}
      >
        {code && <Flag code={code} size={20} />}
        <Text style={styles.itemText}>{countryName(name)}</Text>
        {name === selected ? (
          <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
        ) : (
          <Text style={styles.chevron}>›</Text>
        )}
      </Pressable>
    );
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
    >
      {isSearching ? (
        <>
          {searchMatches(trimmed).map(renderRow)}
          {searchMatches(trimmed).length === 0 && (
            <Text style={styles.empty}>{t('passport.noResults')}</Text>
          )}
        </>
      ) : (
        <>
          {showPopularWhenEmpty && (
            <>
              <Text style={styles.sectionLabel}>{popularLabel ?? t('passport.popular')}</Text>
              {popularCountries.map(renderRow)}
            </>
          )}
          <Text style={styles.sectionLabel}>{t('passport.allCountries')}</Text>
          {allCountriesSorted.map(renderRow)}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 40,
  },
  sectionLabel: { ...Typography.sectionLabel, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: systemColor('separator'),
  },
  itemPressed: {
    backgroundColor: systemColor('systemGray5'),
  },
  itemText: {
    flex: 1,
    fontSize: FontSize.callout,
    color: systemColor('label'),
  },
  chevron: {
    fontSize: FontSize.title3,
    color: systemColor('tertiaryLabel'),
  },
  empty: {
    textAlign: 'center',
    color: systemColor('tertiaryLabel'),
    paddingTop: 40,
    fontSize: FontSize.subheadline,
  },
});
