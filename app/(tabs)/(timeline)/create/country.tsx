import { useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CountryPicker } from '../../../../components/CountryPicker';

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
      <CountryPicker query={query} onSelect={pickCountry} />
    </>
  );
}
