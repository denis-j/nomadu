module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Required by react-native-worklets-core (used by react-native-filament)
      'react-native-worklets-core/plugin',
    ],
  };
};
