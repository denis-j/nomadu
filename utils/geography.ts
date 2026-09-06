import geoData from '../constants/geo-data.json';

/**
 * Country and city lookups, backed by `constants/geo-data.json`.
 *
 * Built from GeoNames by `scripts/build-cities.mjs`, which drops anything
 * marked as a section of a populated place. The previous source
 * (`country-state-city`) had no such marker and listed 97 places for Berlin,
 * of which one was Berlin and 96 were districts: searching for a trip
 * destination offered "Kreuzberg" and "Märkisches Viertel" alongside it.
 *
 * Cities arrive pre-sorted by population, so the first page of a picker and
 * the top of a search are the places people actually mean.
 */

export interface CountryInfo {
  name: string;
  isoCode: string;
  flag: string;
}

export interface CityInfo {
  name: string;
  latlong: { latitude: string; longitude: string };
}

/** [name, latitude, longitude, population, alternateSpellings] */
type CityRow = [string, number, number, number, string[]];

const RAW = geoData as unknown as {
  countries: [string, string][];
  cities: Record<string, CityRow[]>;
};

/** ISO 3166-1 alpha-2 to the regional-indicator pair that renders as a flag. */
function isoToFlag(isoCode: string): string {
  if (isoCode.length !== 2) return '🌍';
  return String.fromCodePoint(
    ...isoCode.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

// ─── Lazy caches ─────────────────────────────────────────────────────────────

let _allCountries: CountryInfo[] | null = null;
let _countryNames: string[] | null = null;
let _byLowerName: Map<string, CountryInfo> | null = null;
let _byIso: Map<string, CountryInfo> | null = null;

function ensureCountries() {
  if (_allCountries) return;
  _allCountries = RAW.countries.map(([isoCode, name]) => ({
    name,
    isoCode,
    flag: isoToFlag(isoCode),
  }));
  _countryNames = _allCountries.map((c) => c.name);
  _byLowerName = new Map(_allCountries.map((c) => [c.name.toLowerCase(), c]));
  _byIso = new Map(_allCountries.map((c) => [c.isoCode.toLowerCase(), c]));
}

/** Country ISO → city names, deduplicated, biggest first. */
const cityNameCache = new Map<string, string[]>();

function getCitiesForIso(isoCode: string): string[] {
  const cached = cityNameCache.get(isoCode);
  if (cached) return cached;

  const rows = RAW.cities[isoCode] ?? [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const [name] of rows) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  cityNameCache.set(isoCode, names);
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
  return _byLowerName!.get(countryName.toLowerCase())?.isoCode ?? 'XX';
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
  const rows = RAW.cities[resolveIsoCode(countryName)] ?? [];
  const q = query.trim().toLowerCase();
  if (!q) return getCitiesForIso(resolveIsoCode(countryName)).slice(0, 50);

  // Three tiers, in descending confidence: the name starts with the query, the
  // name contains it, or an alternate spelling matches. The last tier is what
  // lets "Koh Phangan" find the city GeoNames calls "Ko Pha Ngan".
  const prefix: string[] = [];
  const contains: string[] = [];
  const viaAlternate: string[] = [];
  const seen = new Set<string>();

  for (const [name, , , , alternates] of rows) {
    if (prefix.length + contains.length + viaAlternate.length >= 50) break;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    if (key.startsWith(q)) {
      seen.add(key);
      prefix.push(name);
    } else if (key.includes(q)) {
      seen.add(key);
      contains.push(name);
    } else if (alternates.some((a) => a.toLowerCase().includes(q))) {
      seen.add(key);
      viaAlternate.push(name);
    }
  }
  return [...prefix, ...contains, ...viaAlternate];
}

/**
 * The known city closest to a coordinate, within `maxKm`.
 *
 * Used to keep reverse-geocoded names on the same vocabulary as the picker.
 * Apple's geocoder is inconsistent across countries: in Germany it returns
 * "Berlin" for a coordinate in Kreuzberg, but in Thailand it returns
 * "Phra Nakhon District" for central Bangkok. Snapping to the nearest known
 * city gives "Bangkok" in both cases.
 */
export function nearestCity(
  latitude: number,
  longitude: number,
  isoCode: string,
  maxKm: number = 30,
): { name: string; distanceKm: number } | null {
  const rows = RAW.cities[isoCode.toUpperCase()];
  if (!rows) return null;

  // Plain nearest-neighbour is wrong for anywhere inside a large city: a
  // coordinate in Märkisches Viertel is 3 km from the centre of Glienicke and
  // 8 km from the centre of Berlin, and the answer is Berlin. A city reaches
  // roughly as far as its size, so each one gets a radius from its population
  // and the largest whose radius covers the point wins.
  let covering: CityRow | null = null;
  let coveringKm = 0;
  let nearest: CityRow | null = null;
  let nearestKm = Infinity;

  for (const row of rows) {
    const km = haversineKm(latitude, longitude, row[1], row[2]);

    if (km < nearestKm) {
      nearestKm = km;
      nearest = row;
    }
    if (km <= cityRadiusKm(row[3]) && (!covering || row[3] > covering[3])) {
      covering = row;
      coveringKm = km;
    }
  }

  if (covering) return { name: covering[0], distanceKm: coveringKm };
  // Nothing claims the point, so fall back to whatever is closest. This is the
  // normal case in the countryside, where the nearest town is the right answer.
  return nearest && nearestKm <= maxKm ? { name: nearest[0], distanceKm: nearestKm } : null;
}

/**
 * How far a city plausibly extends from the coordinate GeoNames gives for it.
 *
 * Square-rooting the population makes this scale with area rather than
 * headcount, which matches how cities actually spread: Bangkok (5.1M) reaches
 * ~23 km, Berlin (3.4M) ~18 km, a 20k town ~2 km. The floor keeps small towns
 * from claiming only their own centre point; the ceiling stops a megacity from
 * swallowing its neighbours.
 */
function cityRadiusKm(population: number): number {
  if (population <= 0) return MIN_CITY_RADIUS_KM;
  const km = Math.sqrt(population) / 100;
  return Math.min(Math.max(km, MIN_CITY_RADIUS_KM), MAX_CITY_RADIUS_KM);
}

const MIN_CITY_RADIUS_KM = 2;
const MAX_CITY_RADIUS_KM = 25;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export function getCountryCode(countryName: string): string {
  return resolveIsoCode(countryName);
}

export function getCountryName(isoCode: string): string | undefined {
  ensureCountries();
  return _byIso!.get(isoCode.toLowerCase())?.name;
}

export function getCountryFlag(countryName: string): string | undefined {
  ensureCountries();
  return _byLowerName!.get(countryName.toLowerCase())?.flag;
}
