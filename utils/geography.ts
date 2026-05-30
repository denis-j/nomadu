import { Country, City, ICity } from 'country-state-city';

export interface CountryInfo {
  name: string;
  isoCode: string;
  flag: string;
}

export interface CityInfo {
  name: string;
  latlong: { latitude: string; longitude: string };
}

// ─── Lazy caches ─────────────────────────────────────────────────────────────

let _allCountries: CountryInfo[] | null = null;
let _countryNames: string[] | null = null;

function ensureCountries() {
  if (!_allCountries) {
    _allCountries = Country.getAllCountries().map((c) => ({
      name: c.name,
      isoCode: c.isoCode,
      flag: c.flag,
    }));
    _countryNames = _allCountries.map((c) => c.name).sort();
  }
}

// Cities cache: countryIsoCode → deduplicated sorted city names
const citiesCache = new Map<string, string[]>();

function getCitiesForIso(isoCode: string): string[] {
  if (citiesCache.has(isoCode)) return citiesCache.get(isoCode)!;

  const raw = City.getCitiesOfCountry(isoCode) ?? [];
  // Deduplicate by name (some countries have duplicate city names across states)
  const seen = new Set<string>();
  const names: string[] = [];
  for (const c of raw) {
    if (!seen.has(c.name)) {
      seen.add(c.name);
      names.push(c.name);
    }
  }
  names.sort((a, b) => a.localeCompare(b));
  citiesCache.set(isoCode, names);
  return names;
}

// ─── Countries ───────────────────────────────────────────────────────────────

export function getAllCountries(): CountryInfo[] {
  ensureCountries();
  return _allCountries!;
}

export function getCountryNames(): string[] {
  ensureCountries();
  return _countryNames!;
}

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

// ─── Cities ──────────────────────────────────────────────────────────────────

function resolveIsoCode(countryName: string): string {
  ensureCountries();
  const found = _allCountries!.find(
    (c) => c.name.toLowerCase() === countryName.toLowerCase(),
  );
  return found?.isoCode ?? 'XX';
}

export async function getCitiesByCountryAsync(countryName: string): Promise<string[]> {
  return getCitiesForIso(resolveIsoCode(countryName));
}

export async function getCitiesByCountryPaginated(
  countryName: string,
  page: number = 1,
  limit: number = 100,
): Promise<{ cities: string[]; hasMore: boolean; total: number }> {
  const all = getCitiesForIso(resolveIsoCode(countryName));
  const start = (page - 1) * limit;
  const end = start + limit;
  return { cities: all.slice(start, end), hasMore: end < all.length, total: all.length };
}

export async function searchCitiesByCountry(
  countryName: string,
  query: string,
): Promise<string[]> {
  const all = getCitiesForIso(resolveIsoCode(countryName));
  const q = query.toLowerCase();
  // Prefix matches first, then includes — max 50 results
  const prefix: string[] = [];
  const contains: string[] = [];
  for (const city of all) {
    const lower = city.toLowerCase();
    if (lower.startsWith(q)) prefix.push(city);
    else if (lower.includes(q)) contains.push(city);
    if (prefix.length + contains.length >= 50) break;
  }
  return [...prefix, ...contains];
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export function getCountryCode(countryName: string): string {
  return resolveIsoCode(countryName);
}

export function getCountryFlag(countryName: string): string | undefined {
  ensureCountries();
  return _allCountries!.find(
    (c) => c.name.toLowerCase() === countryName.toLowerCase(),
  )?.flag;
}
