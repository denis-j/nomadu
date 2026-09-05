module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Required by react-native-worklets-core (used by react-native-filament)
      'react-native-worklets-core/plugin',
    ],
    env: {
      production: {
        plugins: [
          // Strip console output from release builds. `error` and `warn` are
          // kept: a few catch blocks still report through them, and they are
          // the ones worth having if something goes wrong in the field.
          //
          // This is about more than noise. Console calls are not free in
          // Hermes, and anything logged is readable on a connected device, so
          // it is a small privacy surface as well as a small cost.
          ['transform-remove-console', { exclude: ['error', 'warn'] }],
        ],
      },
    },
  };
};
