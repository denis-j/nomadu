import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { CountryPicker } from '../../../components/CountryPicker';
import { setPendingCountry } from '../../../lib/countryPickerBridge';
import { useTranslation } from '../../../contexts/LanguageContext';

export default function VisaCountryPickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState('');

  return (
    <>
      <Stack.Screen
        options={{
          title: t('nav.chooseCountry'),
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
          setPendingCountry({ name, code });
          router.back();
        }}
      />
    </>
  );
}
