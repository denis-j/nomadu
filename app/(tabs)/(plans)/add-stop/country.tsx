import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { systemColor } from '../../../../constants/colors';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { getPopularCountries, searchCountries, getCountryCode, getCountryNames } from '../../../../utils/geography';
import { useTranslation } from '../../../../contexts/LanguageContext';
import { Flag } from '../../../../components/Flag';
import { Typography, FontSize } from '../../../../constants/typography';

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
  /** '1' when the start is fixed by the previous stop and only the length is chosen. */
  lockStart?: string;
};

export default function AddStopCountryScreen() {
  const { t, countryName } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? (() => {
        const eng = searchCountries(query);
        const seen = new Set(eng);
        const ql = query.trim().toLowerCase();
        return [...eng, ...getCountryNames().filter((c) => !seen.has(c) && countryName(c).toLowerCase().includes(ql))];
      })()
    : popularCountries;
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
        ...(params.lockStart && { lockStart: params.lockStart }),
        ...(params.transport && { transport: params.transport }),
        ...(params.notes && { notes: params.notes }),
      },
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: isEditing ? t('timelineCreate.editCountry') : t('nav.chooseCountry'),
          headerSearchBarOptions: {
            placeholder: t('common.searchCountries'),
            onChangeText: (e: any) => setQuery(e.nativeEvent.text),
          },
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
      >
        {!query.trim() && <Text style={styles.sectionLabel}>{t('addStop.popular')}</Text>}
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
              <Text style={styles.itemText}>{countryName(name)}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        })}
        {filtered.length === 0 && <Text style={styles.empty}>{t('passport.noResults')}</Text>}
      </ScrollView>
    </>
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

  flagWrap: {
    width: 28,
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
