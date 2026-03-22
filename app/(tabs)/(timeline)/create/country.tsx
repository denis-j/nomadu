import { useState } from 'react';
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { getPopularCountries, searchCountries, getCountryFlag } from '../../../../utils/geography';

const popularCountries = getPopularCountries();

type Params = {
  id?: string;
  country?: string;
  city?: string;
  start?: string;
  end?: string;
  noEnd?: string;
};

export default function CreateCountryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const [query, setQuery] = useState('');

  const filtered = query.trim() ? searchCountries(query) : popularCountries;
  const isEditing = !!params.id;

  const pickCountry = (name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: './city',
      params: {
        country: name,
        ...(params.start && { start: params.start }),
        ...(params.end && { end: params.end }),
        ...(isEditing && { id: params.id, city: params.city, noEnd: params.noEnd }),
      },
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: isEditing ? 'Edit Country' : 'Choose Country',
          headerSearchBarOptions: {
            placeholder: 'Search countries…',
            onChangeText: (e: any) => setQuery(e.nativeEvent.text),
          },
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
      >
        {!query.trim() && <Text style={styles.sectionLabel}>Popular</Text>}
        {filtered.map((name) => {
          const flag = getCountryFlag(name);
          return (
            <Pressable
              key={name}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              onPress={() => pickCountry(name)}
            >
              {flag ? <Text style={styles.flag}>{flag}</Text> : null}
              <Text style={styles.itemText}>{name}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        })}
        {filtered.length === 0 && <Text style={styles.empty}>No countries found</Text>}
      </ScrollView>
    </>
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
  flag: {
    fontSize: 22,
    width: 28,
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
