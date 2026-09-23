// Runs the tests under test/ with Node's own runner.
//
// Each test file is bundled the same way the function is (shared app code,
// Expo stubs), with one more substitution: `firebase-admin/firestore` is
// replaced by test/fakeFirestore.ts, an in-memory stand-in with the handful
// of methods the routes use. No emulator, no Java, no network; the whole
// suite runs in a second.
import * as esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stubPlugin } from './expoStubs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testDir = resolve(root, 'test');
const outDir = resolve(root, 'lib/test');
const fake = resolve(testDir, 'fakeFirestore.ts');
const fakeStorage = resolve(testDir, 'fakeStorage.ts');

const fakeFirestorePlugin = {
  name: 'fake-firestore',
  setup(build) {
    build.onResolve({ filter: /^firebase-admin\/firestore$/ }, () => ({ path: fake }));
    build.onResolve({ filter: /^firebase-admin\/storage$/ }, () => ({ path: fakeStorage }));
  },
};

const files = readdirSync(testDir).filter((f) => f.endsWith('.test.ts')).map((f) => resolve(testDir, f));
await esbuild.build({
  entryPoints: files,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outdir: outDir,
  outExtension: { '.js': '.cjs' },
  sourcemap: 'inline',
  plugins: [fakeFirestorePlugin, stubPlugin],
  external: ['firebase-admin', 'firebase-functions', 'express'],
  logLevel: 'warning',
});

const outputs = files.map((f) => resolve(outDir, f.split('/').pop().replace(/\.ts$/, '.cjs')));
const result = spawnSync(process.execPath, ['--test', '--enable-source-maps', ...outputs], { stdio: 'inherit' });
process.exit(result.status ?? 1);
