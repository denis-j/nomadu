import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CountryPicker } from '../../../../components/CountryPicker';
import { useTranslation } from '../../../../contexts/LanguageContext';

/** Step 1 of 3. One tap, then straight on. */
export default function AddVisaCountryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState('');

  return (
    <>
      <Stack.Screen
        options={{
          title: t('nav.whichCountry'),
          headerSearchBarOptions: {
            placeholder: t('common.searchCountries'),
            onChangeText: (e: any) => setQuery(e.nativeEvent.text),
          },
        }}
      />
      <CountryPicker
        query={query}
        onSelect={(name, code) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({ pathname: '/(tabs)/(stats)/visa-new/stay', params: { code, name } });
        }}
      />
    </>
  );
}
