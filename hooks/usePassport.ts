import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from './useAuth';
import { getCitizenship } from '../lib/onboarding';
import { getCitizenshipCache } from '../lib/prefetch';

export function usePassport() {
  const { user } = useAuth();
  const cached = getCitizenshipCache();
  const [country, setCountry] = useState<string | null>(cached?.country ?? null);
  const [countryCode, setCountryCode] = useState<string | null>(cached?.countryCode ?? null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      getCitizenship(user.uid).then((c) => {
        setCountry(c?.country ?? null);
        setCountryCode(c?.countryCode ?? null);
      });
    }, [user]),
  );

  return { country, countryCode };
}
