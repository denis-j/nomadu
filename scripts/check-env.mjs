#!/usr/bin/env node
/**
 * Fail the build when the client config is missing.
 *
 * `EXPO_PUBLIC_*` values are inlined into the JS bundle at build time. They
 * live in `.env.local`, which is gitignored and therefore never uploaded to
 * EAS, so on a build server they come from the EAS environment instead. When
 * they are absent nothing complains: Metro inlines `undefined`, the build
 * succeeds, and the app crashes on the first screen because
 * `initializeApp({ apiKey: undefined })` throws while the module loads.
 * That shipped once as build 1.0.4 (4) and cost a TestFlight round trip.
 *
 * Runs as the `eas-build-pre-install` hook, so a missing value stops the build
 * in the first seconds with a readable message.
 */

const REQUIRED = [
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_GOOGLE_GCM_SENDER_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_API_KEY',
  'EXPO_PUBLIC_GOOGLE_IOS_APP_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_SENTRY_DSN',
];

const missing = REQUIRED.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error('\nMissing client config, the app would crash on launch:\n');
  for (const name of missing) console.error(`  ${name}`);
  console.error(
    '\nLocally these come from .env.local. On EAS they come from the build' +
      "\nenvironment, which that file never reaches because it is gitignored." +
      '\nPush them once per environment:' +
      '\n\n  npx eas-cli env:push production --path .env.local\n',
  );
  process.exit(1);
}

console.log(`Client config complete (${REQUIRED.length} variables).`);
