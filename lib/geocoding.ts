import * as Location from 'expo-location';
import { getCountryName, nearestCity } from '../utils/geography';

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
  // 1) Try native geocoder first (Apple/Google Maps) — best at resolving
  //    local admin structures to recognisable city names (e.g. "Phuket"
  //    instead of the sub-district "Ratsada").
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results.length > 0) {
      const result = results[0];
      const city = result.city ?? result.subregion ?? result.region ?? null;
      const code = result.isoCountryCode ?? null;
      if (city && code) {
        return {
          // Apple's `city` is not consistently a city. In Germany a coordinate
          // in Kreuzberg correctly yields "Berlin", but central Bangkok yields
          // "Phra Nakhon District", and Phuket yields the sub-district
          // "Ratsada". Snapping to the nearest city we know keeps trip names on
          // the same vocabulary the picker offers, so the timeline never shows
          // a district. If nothing is close enough, the geocoder's answer
          // stands: small places are missing from any population-filtered list.
          city: nearestCity(latitude, longitude, code)?.name ?? city,
          // One source of truth for country names. Apple returns them in the
          // device language ("Deutschland" on a German phone), and these are
          // stored on the trip and grouped on in stats and visa screens, so
          // they have to match what the country picker writes.
          country: getCountryName(code) ?? result.country ?? null,
          countryCode: code,
        };
      }
    }
  } catch {
    // continue to Nominatim
  }

  // 2) Nominatim fallback — English names for when native geocoder fails
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=en&zoom=10`,
      { headers: { 'User-Agent': 'NomadApp/1.0' } },
    );
    if (resp.ok) {
      const data = await resp.json();
      const addr = data.address;
      if (addr?.country_code) {
        const city =
          addr.city ??
          addr.town ??
          addr.municipality ??
          addr.village ??
          addr.county ??
          addr.state ??
          null;
        if (city) {
          const code = addr.country_code.toUpperCase();
          return {
            // Same snapping and the same country names as the branch above, so
            // a trip does not depend on which geocoder happened to answer.
            city: nearestCity(latitude, longitude, code)?.name ?? city,
            country: getCountryName(code) ?? addr.country ?? null,
            countryCode: code,
          };
        }
      }
    }
  } catch {
    // give up
  }

  return { city: null, country: null, countryCode: null };
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
