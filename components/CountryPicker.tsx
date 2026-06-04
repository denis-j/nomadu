import { PlatformColor, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Flag } from './Flag';
import { getCountryCode, getPopularCountries, searchCountries } from '../utils/geography';

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
}

/**
 * Reusable iOS-native country picker body. Render inside a Stack screen that
 * wires the search bar via `headerSearchBarOptions` and forwards onChangeText
 * to this component's `query` prop. The picker itself is pure presentation —
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
  popularLabel = 'Popular',
}: CountryPickerProps) {
  const trimmed = query.trim();
  const isSearching = trimmed.length > 0;
  const filtered = isSearching
    ? searchCountries(trimmed)
    : showPopularWhenEmpty ? popularCountries : [];

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
    >
      {!isSearching && showPopularWhenEmpty && (
        <Text style={styles.sectionLabel}>{popularLabel}</Text>
      )}
      {filtered.map((name) => {
        const code = getCountryCode(name);
        return (
          <Pressable
            key={name}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => onSelect(name, code)}
          >
            {code && <Flag code={code} size={20} />}
            <Text style={styles.itemText}>{name}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        );
      })}
      {isSearching && filtered.length === 0 && (
        <Text style={styles.empty}>No countries found</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: PlatformColor('secondaryLabel'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
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
  chevron: {
    fontSize: 20,
    color: PlatformColor('tertiaryLabel'),
  },
  empty: {
    textAlign: 'center',
    color: PlatformColor('tertiaryLabel'),
    paddingTop: 40,
    fontSize: 15,
  },
});
