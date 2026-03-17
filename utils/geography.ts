import { countries, cities as citiesLib } from 'country-cities';

export interface CountryInfo {
  name: string;
  isoCode: string;
  flag: string;
}

export interface CityInfo {
  name: string;
  latlong: { latitude: string; longitude: string };
}

const citiesCache = new Map<string, string[]>();

// ─── Lazy-loaded country cache ───

let _allCountries: CountryInfo[] | null = null;
let _countryNames: string[] | null = null;

function ensureCountries() {
  if (!_allCountries) {
    _allCountries = countries.all().map((c: any) => ({
      name: c.name,
      isoCode: c.isoCode,
      flag: c.flag,
    }));
    _countryNames = _allCountries.map((c) => c.name).sort();
  }
}

export function getAllCountries(): CountryInfo[] {
  ensureCountries();
  return _allCountries!;
}

export function getCountryNames(): string[] {
  ensureCountries();
  return _countryNames!;
}

// Popular countries shown before searching
const POPULAR_COUNTRIES = [
  'Germany', 'United States', 'United Kingdom', 'France', 'Spain',
  'Italy', 'Portugal', 'Netherlands', 'Austria', 'Switzerland',
  'Thailand', 'Japan', 'Australia', 'Canada', 'Brazil',
  'Mexico', 'Indonesia', 'Croatia', 'Greece', 'Slovenia',
];

export function getPopularCountries(): string[] {
  return POPULAR_COUNTRIES;
}

export function searchCountries(query: string): string[] {
  if (!query.trim()) return POPULAR_COUNTRIES;
  const q = query.toLowerCase();
  return getCountryNames().filter((c) => c.toLowerCase().includes(q));
}

export async function getCitiesByCountryAsync(countryName: string): Promise<string[]> {
  if (citiesCache.has(countryName)) {
    return citiesCache.get(countryName)!;
  }
  
  const country = countries.all().find(
    (c: any) => c.name.toLowerCase() === countryName.toLowerCase()
  );
  
  if (!country) return [];
  
  const countryCities = await citiesLib.getByCountry(country.isoCode) ?? [];
  const cityNames = countryCities.map((city: any) => city.name);
  citiesCache.set(countryName, cityNames);
  return cityNames;
}

export async function getCitiesByCountryPaginated(
  countryName: string,
  page: number = 1,
  limit: number = 100
): Promise<{ cities: string[]; hasMore: boolean; total: number }> {
  const allCities = await getCitiesByCountryAsync(countryName);
  const total = allCities.length;
  const start = (page - 1) * limit;
  const end = start + limit;
  
  return {
    cities: allCities.slice(start, end),
    hasMore: end < total,
    total,
  };
}

export async function searchCitiesByCountry(
  countryName: string,
  query: string
): Promise<string[]> {
  const allCities = await getCitiesByCountryAsync(countryName);
  const q = query.toLowerCase();
  return allCities.filter((city) => city.toLowerCase().includes(q));
}

export function getCountryCode(countryName: string): string {
  const country = countries.all().find(
    (c: any) => c.name.toLowerCase() === countryName.toLowerCase()
  );
  return country?.isoCode ?? 'XX';
}

export function getCountryFlag(countryName: string): string | undefined {
  const country = countries.all().find(
    (c: any) => c.name.toLowerCase() === countryName.toLowerCase()
  );
  return country?.flag;
}
