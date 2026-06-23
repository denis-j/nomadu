#!/usr/bin/env node
/**
 * Fetch the latest passport-index-dataset and emit `constants/visa-data.json`.
 *
 * Source: https://github.com/ilyankou/passport-index-dataset (MIT-licensed)
 * Coverage: ~199 passports x ~199 destinations.
 *
 * Cell values from the CSV are kept verbatim — the lookup logic in
 * `constants/visaRules.ts` is responsible for turning them into VisaRule
 * objects. Keeping the raw cells means the JSON refresh is just a re-download.
 *
 * Re-run via: `node scripts/build-visa-data.mjs`
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const SRC = 'https://raw.githubusercontent.com/ilyankou/passport-index-dataset/master/passport-index-matrix-iso2.csv';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'constants', 'visa-data.json');

function fetchText(url) {
  return new Promise((resolveP, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolveP(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseCSV(text) {
  // The dataset has no commas inside cell values, so a naive split is safe.
  const lines = text.trim().split('\n');
  const header = lines[0].split(',');
  const destinations = header.slice(1); // skip "Passport" column
  const matrix = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const passport = cols[0];
    matrix[passport] = {};
    for (let j = 0; j < destinations.length; j++) {
      const raw = cols[j + 1];
      // Try numeric first
      const num = Number(raw);
      if (!Number.isNaN(num)) {
        matrix[passport][destinations[j]] = num;
      } else {
        matrix[passport][destinations[j]] = raw;
      }
    }
  }

  return { matrix, passports: lines.length - 1, destinations: destinations.length };
}

const today = new Date().toISOString().slice(0, 10);

console.log(`Fetching ${SRC}…`);
const csv = await fetchText(SRC);
console.log(`Got ${csv.length} bytes.`);

const { matrix, passports, destinations } = parseCSV(csv);
console.log(`Parsed ${passports} passports x ${destinations} destinations.`);

const payload = {
  _meta: {
    source: 'https://github.com/ilyankou/passport-index-dataset',
    license: 'MIT',
    licenseCopyright: 'Copyright (c) 2019 Ilya Ilyankou',
    refreshedAt: today,
    passports,
    destinations,
  },
  matrix,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload));
console.log(`Wrote ${OUT}`);
