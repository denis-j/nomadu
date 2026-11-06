import { getCountryCode } from '../../utils/geography';
import countryNamesDe from '../../constants/countryNames.de.json';

/**
 * Localise an English country name (as stored in the data) to the active
 * language.
 *
 * The German names are bundled (`constants/countryNames.de.json`, keyed by
 * lowercase ISO code) so this works regardless of whether the runtime's
 * `Intl.DisplayNames` is available — Hermes on iOS often ships without it.
 * `Intl` is only a last-resort fallback for languages we have no table for.
 */
const DE = countryNamesDe as Record<string, string>;

const intlCache: Record<string, Intl.DisplayNames | null> = {};
function displayNamesFor(language: string): Intl.DisplayNames | null {
  if (!(language in intlCache)) {
    try {
      intlCache[language] = new Intl.DisplayNames([language], { type: 'region' });
    } catch {
      intlCache[language] = null;
    }
  }
  return intlCache[language];
}

export function localizedCountryName(name: string | null | undefined, language: string): string {
  if (!name) return name ?? '';
  if (language === 'en') return name;

  const code = getCountryCode(name);
  if (!code) return name;
  const key = code.toLowerCase();

  if (language === 'de' && DE[key]) return DE[key];

  const dn = displayNamesFor(language);
  if (dn) {
    try {
      return dn.of(code.toUpperCase()) ?? name;
    } catch {
      return name;
    }
  }
  return name;
}
