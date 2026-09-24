// Sentry's wrapper around Expo's default config: it stamps every bundle with
// a debug id, which is how Sentry matches a crash to its source map. With the
// plain Expo config the maps were uploaded but never matched, so every stack
// frame pointed into minified bytecode.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// Bundle 3D model files as assets
config.resolver.assetExts.push('glb', 'gltf', 'hdr', 'bin');

module.exports = config;
