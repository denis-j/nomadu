import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from './useAuth';
import { getCitizenship } from '../lib/onboarding';

export function usePassport() {
  const { user } = useAuth();
  const [country, setCountry] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      getCitizenship(user.uid).then((c) => {
        if (c) {
          setCountry(c.country);
          setCountryCode(c.countryCode);
        } else {
          setCountry(null);
          setCountryCode(null);
        }
      });
    }, [user]),
  );

  return { country, countryCode };
}
