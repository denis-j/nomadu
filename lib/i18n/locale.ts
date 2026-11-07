import type { Language } from './translations';

/**
 * The app's language for code outside React: date and number formatting in
 * lib/ and in plain helper functions. The LanguageProvider keeps it current;
 * everything else only reads it. English is the default and the base, German
 * only changes what differs (day before month, comma for decimals).
 */
let active: Language = 'en';

export function setActiveLanguage(language: Language): void {
  active = language;
}

export function activeLanguage(): Language {
  return active;
}

/** The locale tag for `toLocaleDateString` and `toLocaleString`. */
export function appLocale(): string {
  return active === 'de' ? 'de-DE' : 'en-US';
}
