// Bundles the functions with esbuild so they can share the app's own logic
// (visa, tax, stats, date chaining, accommodation rules) instead of a copy
// that drifts. Expo-only modules that those files import are replaced with
// stubs (scripts/expoStubs.mjs); none of them is called on the server, they
// are just in the import graph.
import * as esbuild from 'esbuild';
import { stubPlugin } from './scripts/expoStubs.mjs';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'lib/index.js',
  sourcemap: true,
  plugins: [stubPlugin],
  external: ['firebase-admin', 'firebase-functions', 'express'],
  logLevel: 'info',
});
