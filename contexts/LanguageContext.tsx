import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  translations,
  type Language,
} from '../lib/i18n/translations';
import { localizedCountryName } from '../lib/i18n/country';

const LANGUAGE_STORAGE_KEY = '@app_language';

/** Values interpolated into a translation string via `{name}` placeholders. */
type TParams = Record<string, string | number>;

interface LanguageContextValue {
  /** Active language. `null` only during the first storage read. */
  language: Language;
  /** True until the stored preference has been read once. */
  ready: boolean;
  /** Whether the user picked a language explicitly (vs. device default). */
  isExplicit: boolean;
  setLanguage: (language: Language) => Promise<void>;
  /** Reset to the device's language. */
  useSystemLanguage: () => Promise<void>;
  t: (key: string, params?: TParams) => string;
  /** Localise a (data-stored, English) country name to the active language. */
  countryName: (name: string | null | undefined) => string;
}

/** The device language if we support it, otherwise English. */
function deviceLanguage(): Language {
  const code = Localization.getLocales()[0]?.languageCode?.toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code ?? '')
    ? (code as Language)
    : 'en';
}

/** Resolve a dot path (`a.b.c`) inside a nested object. */
function resolve(tree: unknown, path: string): string | undefined {
  const value = path
    .split('.')
    .reduce<unknown>((node, key) => (node == null ? undefined : (node as Record<string, unknown>)[key]), tree);
  return typeof value === 'string' ? value : undefined;
}

function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in params ? String(params[key]) : match,
  );
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(deviceLanguage);
  const [isExplicit, setIsExplicit] = useState(false);
  const [ready, setReady] = useState(false);

  // Read the stored preference once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (!cancelled && stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
          setLanguageState(stored as Language);
          setIsExplicit(true);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback(async (next: Language) => {
    setLanguageState(next);
    setIsExplicit(true);
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  }, []);

  const useSystemLanguage = useCallback(async () => {
    setLanguageState(deviceLanguage());
    setIsExplicit(false);
    await AsyncStorage.removeItem(LANGUAGE_STORAGE_KEY);
  }, []);

  // `t` only needs to change when the language does.
  const t = useCallback(
    (key: string, params?: TParams) => {
      const active = resolve(translations[language], key);
      if (active != null) return interpolate(active, params);
      // Fall back to English, then to the raw key so missing strings are
      // visible in development rather than rendering as blank.
      const fallback = resolve(translations.en, key);
      return interpolate(fallback ?? key, params);
    },
    [language],
  );

  const countryName = useCallback(
    (name: string | null | undefined) => localizedCountryName(name, language),
    [language],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ language, ready, isExplicit, setLanguage, useSystemLanguage, t, countryName }),
    [language, ready, isExplicit, setLanguage, useSystemLanguage, t, countryName],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Access translations and the active language. */
export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return ctx;
}

export { LANGUAGE_LABELS, SUPPORTED_LANGUAGES };
export type { Language };
