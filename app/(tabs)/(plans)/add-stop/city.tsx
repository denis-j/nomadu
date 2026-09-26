import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { systemColor } from '../../../../constants/colors';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { getCitiesByCountryPaginated, searchCitiesByCountry } from '../../../../utils/geography';

type Params = {
  journeyId: string;
  country: string;
  legId?: string;
  city?: string;
  start?: string;
  end?: string;
  transport?: string;
  notes?: string;
  /** '1' when the start is fixed by the previous stop and only the length is chosen. */
  lockStart?: string;
};

export default function AddStopCityScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const { country } = params;

  const [cities, setCities] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // True until the first page arrives, so the empty state does not flash
  // before there is anything to show.
  const [initialLoading, setInitialLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!country) { setInitialLoading(false); return; }
    setInitialLoading(true);
    getCitiesByCountryPaginated(country, 1, 30).then((r) => {
      setCities(r.cities);
      setHasMore(r.hasMore);
      setPage(1);
      setInitialLoading(false);
    });
  }, [country]);

  const handleSearch = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!text.trim()) { setSearchResults(null); setSearchLoading(false); return; }
      setSearchLoading(true);
      debounceRef.current = setTimeout(() => {
        searchCitiesByCountry(country, text).then((r) => {
          setSearchResults(r);
          setSearchLoading(false);
        });
      }, 250);
    },
    [country],
  );

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const next = page + 1;
    getCitiesByCountryPaginated(country, next, 30).then((r) => {
      setCities((p) => [...p, ...r.cities]);
      setHasMore(r.hasMore);
      setPage(next);
      setLoadingMore(false);
    });
  };

  const pickCity = (name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: './dates',
      params: {
        journeyId: params.journeyId,
        country,
        city: name,
        ...(params.legId && { legId: params.legId }),
        ...(params.start && { start: params.start }),
        ...(params.end && { end: params.end }),
        ...(params.lockStart && { lockStart: params.lockStart }),
        ...(params.transport && { transport: params.transport }),
        ...(params.notes && { notes: params.notes }),
      },
    });
  };

  const displayed = searchResults ?? cities;
  const trimmedQuery = query.trim();
  const isSearching = (trimmedQuery !== '' && searchLoading) || (trimmedQuery === '' && initialLoading);

  return (
    <>
      <Stack.Screen
        options={{
          title: country,
          headerSearchBarOptions: {
            placeholder: 'Search cities…',
            onChangeText: (e: any) => handleSearch(e.nativeEvent.text),
          },
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        onScrollEndDrag={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 60) loadMore();
        }}
      >
        {isSearching && (
          <View style={styles.centered}>
            <ActivityIndicator />
          </View>
        )}
        {!isSearching && displayed.map((name, i) => (
          <Pressable
            key={`${name}-${i}`}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => pickCity(name)}
          >
            <Text style={styles.itemText}>{name}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
        {!isSearching && !query && hasMore && (
          <Pressable style={styles.loadMore} onPress={loadMore}>
            <Text style={styles.loadMoreText}>{loadingMore ? 'Loading…' : 'Load more'}</Text>
          </Pressable>
        )}
        {!isSearching && displayed.length === 0 && (
          <Text style={styles.empty}>No cities found</Text>
        )}
        {/* The city list is not exhaustive, so a search that finds nothing
            lets the user continue with the name as typed. The country is
            already known, and the save step geocodes the name and stores
            no coordinates when that fails. */}
        {!isSearching && trimmedQuery !== '' && displayed.length === 0 && (
          <Pressable
            style={({ pressed }) => [styles.item, styles.customItem, pressed && styles.itemPressed]}
            onPress={() => pickCity(trimmedQuery)}
          >
            <Text style={[styles.itemText, styles.customItemText]} numberOfLines={1}>
              {`Use "${trimmedQuery}"`}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 40,
  },
  centered: {
    paddingTop: 40,
    alignItems: 'center',
  },
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
    fontSize: 16,
    color: systemColor('label'),
  },
  customItem: {
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: systemColor('separator'),
  },
  customItemText: {
    color: systemColor('link'),
    fontWeight: '500',
  },
  chevron: {
    fontSize: 20,
    color: systemColor('tertiaryLabel'),
  },
  loadMore: {
    padding: 20,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 15,
    color: systemColor('link'),
    fontWeight: '500',
  },
  empty: {
    textAlign: 'center',
    color: systemColor('tertiaryLabel'),
    paddingTop: 40,
    fontSize: 15,
  },
});
