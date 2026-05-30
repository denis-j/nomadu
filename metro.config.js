const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle 3D model files as assets
config.resolver.assetExts.push('glb', 'gltf', 'hdr', 'bin');

module.exports = config;
