// Writes the served spec to docs/openapi.json so it lives in the repo too.
// Runs after every build, so the file and the deployed function never drift.
import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../lib/openapi.cjs');
await esbuild.build({ entryPoints: [resolve(here, '../src/openapi.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'silent' });
const { openapi } = createRequire(import.meta.url)(out);
const target = resolve(here, '../../docs/openapi.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(openapi(), null, 2) + '\n');
console.log(`wrote ${target}`);
