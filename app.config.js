// Everything is configured in app.json; this only adds what must not be in
// git. Expo loads .env.local before it runs this file, and EAS builds take
// the same names from their environment variables.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      // Google Maps draws the maps on Android (iOS uses Apple Maps, no key).
      // Without a key every map screen crashes. Restricted in the Google
      // Cloud console to com.nomady.app and its signing certificates.
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY },
    },
  },
});
