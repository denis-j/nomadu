import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CountryPicker } from '../../../../components/CountryPicker';

/** Step 1 of 3. One tap, then straight on. */
export default function AddVisaCountryScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Which country?',
          headerSearchBarOptions: {
            placeholder: 'Search countries…',
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
