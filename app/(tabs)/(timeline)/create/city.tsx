import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, PlatformColor, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { getCitiesByCountryPaginated, searchCitiesByCountry } from '../../../../utils/geography';

type Params = {
  country: string;
  id?: string;
  city?: string;
  start?: string;
  end?: string;
  noEnd?: string;
};

export default function CreateCityScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const { country } = params;

  const [cities, setCities] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!country) return;
    getCitiesByCountryPaginated(country, 1, 30).then((r) => {
      setCities(r.cities);
      setHasMore(r.hasMore);
      setPage(1);
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
        country,
        city: name,
        ...(params.start && { start: params.start }),
        ...(params.end && { end: params.end }),
        ...(params.id && { id: params.id, noEnd: params.noEnd }),
      },
    });
  };

  const displayed = searchResults ?? cities;
  const isSearching = query.trim() !== '' && searchLoading;

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
  loadMore: {
    padding: 20,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 15,
    color: PlatformColor('link'),
    fontWeight: '500',
  },
  empty: {
    textAlign: 'center',
    color: PlatformColor('tertiaryLabel'),
    paddingTop: 40,
    fontSize: 15,
  },
});
