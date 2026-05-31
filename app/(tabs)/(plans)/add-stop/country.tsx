import { useState } from 'react';
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { getPopularCountries, searchCountries, getCountryCode } from '../../../../utils/geography';
import { Flag } from '../../../../components/Flag';

const popularCountries = getPopularCountries();

type Params = {
  journeyId: string;
  legId?: string;
  country?: string;
  city?: string;
  start?: string;
  end?: string;
  transport?: string;
  notes?: string;
};

export default function AddStopCountryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const [query, setQuery] = useState('');

  const filtered = query.trim() ? searchCountries(query) : popularCountries;
  const isEditing = !!params.legId;

  const pickCountry = (name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: './city',
      params: {
        journeyId: params.journeyId,
        country: name,
        ...(params.legId && { legId: params.legId }),
        ...(params.city && { city: params.city }),
        ...(params.start && { start: params.start }),
        ...(params.end && { end: params.end }),
        ...(params.transport && { transport: params.transport }),
        ...(params.notes && { notes: params.notes }),
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
          const code = getCountryCode(name);
          return (
            <Pressable
              key={name}
              style={styles.item}
              onPress={() => pickCountry(name)}
            >
              <View style={styles.flagWrap}>
                <Flag code={code} size={20} />
              </View>
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

  flagWrap: {
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
