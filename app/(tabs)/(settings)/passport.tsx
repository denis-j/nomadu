import { useCallback, useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CountryPicker } from '../../../components/CountryPicker';
import { useAuth } from '../../../hooks/useAuth';
import { getCitizenship, setCitizenship } from '../../../lib/onboarding';
import { useTranslation } from '../../../contexts/LanguageContext';

/** The passport: the shared country picker in a sheet, search in the native header. */
export default function PassportSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getCitizenship(user.uid).then((c) => setCurrent(c?.country ?? null));
  }, [user]);

  const select = useCallback(async (name: string, code: string) => {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setCitizenship(user.uid, name, code);
    router.back();
  }, [user, router]);

  return (
    <>
      <Stack.Screen
        options={{
          title: t('nav.passport'),
          headerSearchBarOptions: {
            placeholder: t('common.searchCountries'),
            onChangeText: (e: { nativeEvent: { text: string } }) => setQuery(e.nativeEvent.text),
          },
        }}
      />
      <CountryPicker query={query} onSelect={select} selected={current} />
    </>
  );
}
