#!/usr/bin/env node
/**
 * Build `constants/geo-data.json` from the GeoNames dumps.
 *
 * Replaces the `country-state-city` package, which had two problems for this
 * app. It shipped a 7.7 MB city file with 148k entries, and it mixed city
 * districts in with cities: of the 97 entries it lists for Berlin, exactly one
 * is Berlin. The rest are Kreuzberg, Prenzlauer Berg, Märkisches Viertel and
 * friends, with no field to tell them apart. A trip should be "Berlin", so
 * those must not be offered at all.
 *
 * GeoNames marks a district as feature code `PPLX` ("section of populated
 * place"), which makes the distinction a filter rather than a guess.
 *
 * Source: https://download.geonames.org/export/dump/ (CC BY 4.0)
 *
 * Re-run via: `npm run cities:refresh`
 */

import { createWriteStream, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import https from 'node:https';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'constants', 'geo-data.json');
const WORK = join(tmpdir(), 'nomadu-geonames');

/**
 * Population threshold. `cities5000` covers places from 5.000 inhabitants and
 * lands at ~64k entries after filtering.
 *
 * `cities1000` was measured too: it triples the file to 6.4 MB and still does
 * not contain the small nomad spots one might hope for (Canggu, Ko Tao are in
 * neither, and are missing from the old dataset as well). The extra size buys
 * nothing here.
 */
const CITY_DUMP = 'cities5000';

/**
 * Feature codes that are not standalone places:
 *   PPLX  section of a populated place  (Kreuzberg, Prenzlauer Berg, ...)
 *   PPLQ  abandoned
 *   PPLW  destroyed
 */
const EXCLUDED_FEATURE_CODES = new Set(['PPLX', 'PPLQ', 'PPLW']);

/** Alternate spellings per city. Two is enough for "Koh Phangan" to find "Ko Pha Ngan". */
const MAX_ALTERNATES = 2;

function download(url, dest) {
  return new Promise((res, rej) => {
    const file = createWriteStream(dest);
    https
      .get(url, (r) => {
        if (r.statusCode === 302 || r.statusCode === 301) {
          return download(r.headers.location, dest).then(res, rej);
        }
        if (r.statusCode !== 200) return rej(new Error(`HTTP ${r.statusCode} for ${url}`));
        r.pipe(file);
        file.on('finish', () => file.close(() => res()));
      })
      .on('error', rej);
  });
}

/** Latin-script alternates only; the app's UI and the rest of the data are latin. */
function pickAlternates(field, name) {
  if (!field) return [];
  const lower = name.toLowerCase();
  const out = [];
  for (const alt of field.split(',')) {
    if (out.length >= MAX_ALTERNATES) break;
    if (!alt || alt.length > 40) continue;
    if (!/^[\x20-\x7EÀ-ɏ]+$/.test(alt)) continue;
    if (alt.toLowerCase() === lower) continue;
    if (out.some((a) => a.toLowerCase() === alt.toLowerCase())) continue;
    out.push(alt);
  }
  return out;
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

console.log('Lade GeoNames-Daten...');
await download(`https://download.geonames.org/export/dump/${CITY_DUMP}.zip`, join(WORK, 'cities.zip'));
await download('https://download.geonames.org/export/dump/countryInfo.txt', join(WORK, 'countryInfo.txt'));
execFileSync('unzip', ['-o', '-q', join(WORK, 'cities.zip'), '-d', WORK]);

// ─── Countries ───────────────────────────────────────────────────────────────
// countryInfo.txt is tab separated with '#' comment lines.
// Columns: ISO, ISO3, ISO-Numeric, fips, Country, Capital, ...

/**
 * Where GeoNames uses a formal name and the app has always used the short one.
 *
 * These names are stored on every trip and grouped on in the stats and visa
 * screens, so they have to match what earlier versions wrote. Keeping the list
 * this short is the point: everything else GeoNames already gives in the
 * conventional short form (South Korea, Vietnam, Russia, Laos, Taiwan).
 */
const NAME_OVERRIDES = {
  NL: 'Netherlands',      // GeoNames: "The Netherlands"
  CZ: 'Czech Republic',   // GeoNames: "Czechia"
};

const countries = [];
for (const line of readFileSync(join(WORK, 'countryInfo.txt'), 'utf-8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const f = line.split('\t');
  const iso = f[0];
  const name = NAME_OVERRIDES[iso] ?? f[4];
  if (!iso || !name) continue;
  countries.push([iso, name]);
}
countries.sort((a, b) => a[1].localeCompare(b[1]));

// ─── Cities ──────────────────────────────────────────────────────────────────
// Columns: geonameid, name, asciiname, alternatenames, lat, lon,
//          feature class, feature code, country code, ... , population(14)

const byCountry = {};
let kept = 0;
let dropped = 0;

for (const line of readFileSync(join(WORK, `${CITY_DUMP}.txt`), 'utf-8').split('\n')) {
  if (!line) continue;
  const f = line.split('\t');
  const [, name, , alternates, lat, lon, , featureCode, countryCode] = f;
  const population = Number(f[14]) || 0;

  if (EXCLUDED_FEATURE_CODES.has(featureCode)) {
    dropped++;
    continue;
  }
  if (!name || !countryCode) continue;

  (byCountry[countryCode] ??= []).push([
    name,
    Number(Number(lat).toFixed(4)),
    Number(Number(lon).toFixed(4)),
    population,
    pickAlternates(alternates, name),
  ]);
  kept++;
}

// Biggest first: a search for "san" should surface San Francisco before
// San Fratello, and the picker's first page should be the places people mean.
for (const list of Object.values(byCountry)) {
  list.sort((a, b) => b[3] - a[3] || a[0].localeCompare(b[0]));
}

// A country with no cities is a dead end in the picker: tapping it shows an
// empty list. That covers uninhabited territories (Antarctica, Bouvet Island)
// and entries GeoNames still carries for states that no longer exist
// (Netherlands Antilles, Serbia and Montenegro).
const withCities = countries.filter(([iso]) => (byCountry[iso]?.length ?? 0) > 0);
const withoutCities = countries.length - withCities.length;

writeFileSync(OUT, JSON.stringify({ countries: withCities, cities: byCountry }));
rmSync(WORK, { recursive: true, force: true });

const bytes = readFileSync(OUT).length;
console.log(`  Länder:            ${withCities.length}  (${withoutCities} ohne Städte verworfen)`);
console.log(`  Städte:            ${kept.toLocaleString('de-DE')}`);
console.log(`  davon verworfen:   ${dropped.toLocaleString('de-DE')} (Ortsteile, aufgegeben, zerstört)`);
console.log(`  geschrieben:       ${OUT.replace(ROOT + '/', '')} (${(bytes / 1048576).toFixed(2)} MB)`);
