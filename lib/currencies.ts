import { Alert } from 'react-native';

/**
 * Currencies for the stay's prices, so nobody types "EUR" into a field.
 *
 * A stop knows its country, and the country its currency, so a price at a
 * stop in Japan is in yen unless said otherwise. The picker offers that
 * one first, then the currencies people on the move pay in most, then a
 * prompt for any other three-letter code.
 */

const COMMON = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'THB', 'VND', 'IDR', 'MYR', 'SGD', 'KRW', 'AUD', 'MXN', 'BRL'];

const EURO = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'ME', 'MT', 'NL', 'PT', 'SI', 'SK', 'XK', 'AD', 'MC', 'SM', 'VA'];

const BY_COUNTRY: Record<string, string> = {
  US: 'USD', CA: 'CAD', MX: 'MXN', GB: 'GBP', CH: 'CHF', NO: 'NOK', SE: 'SEK', DK: 'DKK', IS: 'ISK',
  PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN', RS: 'RSD', AL: 'ALL', MK: 'MKD', BA: 'BAM', UA: 'UAH', TR: 'TRY', GE: 'GEL', AM: 'AMD', AZ: 'AZN',
  JP: 'JPY', KR: 'KRW', CN: 'CNY', HK: 'HKD', TW: 'TWD', MO: 'MOP', MN: 'MNT',
  TH: 'THB', VN: 'VND', ID: 'IDR', MY: 'MYR', SG: 'SGD', PH: 'PHP', KH: 'KHR', LA: 'LAK', MM: 'MMK', BN: 'BND',
  IN: 'INR', LK: 'LKR', NP: 'NPR', BD: 'BDT', PK: 'PKR', MV: 'MVR', BT: 'BTN',
  AE: 'AED', QA: 'QAR', SA: 'SAR', OM: 'OMR', BH: 'BHD', KW: 'KWD', JO: 'JOD', IL: 'ILS', LB: 'LBP',
  EG: 'EGP', MA: 'MAD', TN: 'TND', ZA: 'ZAR', KE: 'KES', TZ: 'TZS', UG: 'UGX', RW: 'RWF', ET: 'ETB', GH: 'GHS', NG: 'NGN', MU: 'MUR', SC: 'SCR', NA: 'NAD', BW: 'BWP', MZ: 'MZN', MG: 'MGA', SN: 'XOF', CI: 'XOF',
  AU: 'AUD', NZ: 'NZD', FJ: 'FJD', PG: 'PGK',
  BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', UY: 'UYU', PY: 'PYG', BO: 'BOB', EC: 'USD', PA: 'USD', SV: 'USD', CR: 'CRC', GT: 'GTQ', HN: 'HNL', NI: 'NIO', BZ: 'BZD', DO: 'DOP', CU: 'CUP', JM: 'JMD', TT: 'TTD', BS: 'BSD', BB: 'BBD',
  RU: 'RUB', KZ: 'KZT', UZ: 'UZS', KG: 'KGS', TJ: 'TJS',
};

/** The currency paid in a country, or null when the map does not know it. */
export function currencyForCountry(code: string | null | undefined): string | null {
  if (!code) return null;
  const cc = code.toUpperCase();
  if (EURO.includes(cc)) return 'EUR';
  return BY_COUNTRY[cc] ?? null;
}

/** The codes a currency menu offers: the suggestion first, then what is set, then the common ones. */
export function currencyChoices(current?: string | null, suggested?: string | null): string[] {
  return [...new Set([suggested, current, ...COMMON].filter((c): c is string => !!c))];
}

/** Ask for a code the menu does not list. `onPick` gets three upper-case letters or nothing. */
export function promptCurrency(onPick: (code: string) => void): void {
  Alert.prompt('Currency', 'The three-letter code, like CZK', (text) => {
    const code = (text ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (code.length === 3) onPick(code);
  }, 'plain-text', undefined, 'default');
}
