import * as Location from 'expo-location';

// Country code to flag emoji
export function countryCodeToFlag(code: string): string {
  if (!code || code.length !== 2) return '🌍';
  const codePoints = code
    .toUpperCase()
    .split('')
    .map((char) => 0x1f1e6 + char.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
}

export interface GeocodedLocation {
  city: string | null;
  country: string | null;
  countryCode: string | null;
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<GeocodedLocation> {
  // Try Nominatim first for English results
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=en&zoom=8`,
      { headers: { 'User-Agent': 'NomadApp/1.0' } },
    );
    if (resp.ok) {
      const data = await resp.json();
      const addr = data.address;
      if (addr) {
        return {
          city: addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? null,
          country: addr.country ?? null,
          countryCode: addr.country_code?.toUpperCase() ?? null,
        };
      }
    }
  } catch {
    // Fallback to expo-location
  }

  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results.length > 0) {
      const result = results[0];
      const code = result.isoCountryCode ?? null;
      return {
        city: result.city ?? result.subregion ?? result.region ?? null,
        country: code ? codeToEnglishCountry(code) ?? result.country : result.country ?? null,
        countryCode: code,
      };
    }
  } catch (error) {
    console.warn('Reverse geocoding failed:', error);
  }
  return { city: null, country: null, countryCode: null };
}

// Fallback: map country code → English name (for when Nominatim is unavailable)
function codeToEnglishCountry(code: string): string | null {
  const map: Record<string, string> = {
    AF: 'Afghanistan', AL: 'Albania', DZ: 'Algeria', AR: 'Argentina',
    AT: 'Austria', AU: 'Australia', BD: 'Bangladesh', BE: 'Belgium',
    BG: 'Bulgaria', BR: 'Brazil', CA: 'Canada', CH: 'Switzerland',
    CL: 'Chile', CN: 'China', CO: 'Colombia', CR: 'Costa Rica',
    CU: 'Cuba', CZ: 'Czech Republic', DE: 'Germany', DK: 'Denmark',
    DO: 'Dominican Republic', EC: 'Ecuador', EE: 'Estonia', EG: 'Egypt',
    ES: 'Spain', ET: 'Ethiopia', FI: 'Finland', FR: 'France',
    GB: 'United Kingdom', GE: 'Georgia', GR: 'Greece', GT: 'Guatemala',
    HN: 'Honduras', HR: 'Croatia', HU: 'Hungary', ID: 'Indonesia',
    IE: 'Ireland', IL: 'Israel', IN: 'India', IQ: 'Iraq',
    IR: 'Iran', IS: 'Iceland', IT: 'Italy', JM: 'Jamaica',
    JO: 'Jordan', JP: 'Japan', KE: 'Kenya', KH: 'Cambodia',
    KR: 'South Korea', KW: 'Kuwait', LA: 'Laos', LB: 'Lebanon',
    LT: 'Lithuania', LU: 'Luxembourg', LV: 'Latvia', MA: 'Morocco',
    ME: 'Montenegro', MK: 'North Macedonia', MM: 'Myanmar', MN: 'Mongolia',
    MT: 'Malta', MV: 'Maldives', MX: 'Mexico', MY: 'Malaysia',
    NG: 'Nigeria', NI: 'Nicaragua', NL: 'Netherlands', NO: 'Norway',
    NP: 'Nepal', NZ: 'New Zealand', OM: 'Oman', PA: 'Panama',
    PE: 'Peru', PH: 'Philippines', PK: 'Pakistan', PL: 'Poland',
    PT: 'Portugal', PY: 'Paraguay', QA: 'Qatar', RO: 'Romania',
    RS: 'Serbia', RU: 'Russia', SA: 'Saudi Arabia', SE: 'Sweden',
    SG: 'Singapore', SI: 'Slovenia', SK: 'Slovakia', SV: 'El Salvador',
    TH: 'Thailand', TR: 'Turkey', TW: 'Taiwan', TZ: 'Tanzania',
    UA: 'Ukraine', AE: 'United Arab Emirates', US: 'United States',
    UY: 'Uruguay', UZ: 'Uzbekistan', VE: 'Venezuela', VN: 'Vietnam',
    ZA: 'South Africa', ZM: 'Zambia', ZW: 'Zimbabwe', LK: 'Sri Lanka',
  };
  return map[code.toUpperCase()] ?? null;
}

// Forward geocode: address string → coordinates
export async function forwardGeocode(
  address: string,
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const results = await Location.geocodeAsync(address);
    if (results.length > 0) {
      return { latitude: results[0].latitude, longitude: results[0].longitude };
    }
  } catch (error) {
    console.warn('Forward geocoding failed:', error);
  }
  return null;
}

// Check if two locations are in different cities (rough threshold ~500m)
export function isSignificantMove(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  thresholdKm: number = 0.5,
): boolean {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance >= thresholdKm;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Map of common country names to ISO 3166-1 alpha-2 codes
const countryToCodeMap: Record<string, string> = {
  'afghanistan': 'AF', 'albania': 'AL', 'algeria': 'DZ', 'argentina': 'AR',
  'australia': 'AU', 'austria': 'AT', 'bangladesh': 'BD', 'belgium': 'BE',
  'bolivia': 'BO', 'brazil': 'BR', 'bulgaria': 'BG', 'cambodia': 'KH',
  'canada': 'CA', 'chile': 'CL', 'china': 'CN', 'colombia': 'CO',
  'costa rica': 'CR', 'croatia': 'HR', 'cuba': 'CU', 'czech republic': 'CZ',
  'czechia': 'CZ', 'denmark': 'DK', 'dominican republic': 'DO',
  'ecuador': 'EC', 'egypt': 'EG', 'el salvador': 'SV', 'estonia': 'EE',
  'ethiopia': 'ET', 'finland': 'FI', 'france': 'FR', 'georgia': 'GE',
  'germany': 'DE', 'greece': 'GR', 'guatemala': 'GT', 'honduras': 'HN',
  'hungary': 'HU', 'iceland': 'IS', 'india': 'IN', 'indonesia': 'ID',
  'iran': 'IR', 'iraq': 'IQ', 'ireland': 'IE', 'israel': 'IL',
  'italy': 'IT', 'jamaica': 'JM', 'japan': 'JP', 'jordan': 'JO',
  'kenya': 'KE', 'korea': 'KR', 'south korea': 'KR', 'kuwait': 'KW',
  'laos': 'LA', 'latvia': 'LV', 'lebanon': 'LB', 'lithuania': 'LT',
  'luxembourg': 'LU', 'malaysia': 'MY', 'maldives': 'MV', 'malta': 'MT',
  'mexico': 'MX', 'mongolia': 'MN', 'montenegro': 'ME', 'morocco': 'MA',
  'myanmar': 'MM', 'nepal': 'NP', 'netherlands': 'NL', 'new zealand': 'NZ',
  'nicaragua': 'NI', 'nigeria': 'NG', 'north macedonia': 'MK', 'norway': 'NO',
  'oman': 'OM', 'pakistan': 'PK', 'panama': 'PA', 'paraguay': 'PY',
  'peru': 'PE', 'philippines': 'PH', 'poland': 'PL', 'portugal': 'PT',
  'qatar': 'QA', 'romania': 'RO', 'russia': 'RU', 'saudi arabia': 'SA',
  'serbia': 'RS', 'singapore': 'SG', 'slovakia': 'SK', 'slovenia': 'SI',
  'south africa': 'ZA', 'spain': 'ES', 'sri lanka': 'LK', 'sweden': 'SE',
  'switzerland': 'CH', 'taiwan': 'TW', 'tanzania': 'TZ', 'thailand': 'TH',
  'turkey': 'TR', 'türkiye': 'TR', 'ukraine': 'UA',
  'united arab emirates': 'AE', 'uae': 'AE',
  'united kingdom': 'GB', 'uk': 'GB', 'england': 'GB',
  'united states': 'US', 'usa': 'US', 'us': 'US',
  'uruguay': 'UY', 'uzbekistan': 'UZ', 'venezuela': 'VE',
  'vietnam': 'VN', 'zambia': 'ZM', 'zimbabwe': 'ZW',
};

export function countryToCode(country: string): string {
  return countryToCodeMap[country.toLowerCase().trim()] ?? 'XX';
}
