import { getCountryCode } from '../../utils/geography';

/**
 * Localise an English country name (as stored in the data) to the active
 * language using the platform's own region names (Intl.DisplayNames, available
 * in Hermes). Falls back to the original name when the language is English, the
 * code cannot be resolved, or Intl is unavailable.
 */
const cache: Record<string, Intl.DisplayNames | null> = {};

function displayNamesFor(language: string): Intl.DisplayNames | null {
  if (!(language in cache)) {
    try {
      cache[language] = new Intl.DisplayNames([language], { type: 'region' });
    } catch {
      cache[language] = null;
    }
  }
  return cache[language];
}

export function localizedCountryName(name: string | null | undefined, language: string): string {
  if (!name) return name ?? '';
  if (language === 'en') return name;
  const dn = displayNamesFor(language);
  if (!dn) return name;
  const code = getCountryCode(name);
  if (!code) return name;
  try {
    return dn.of(code.toUpperCase()) ?? name;
  } catch {
    return name;
  }
}
