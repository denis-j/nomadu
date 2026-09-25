// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // functions/lib is the compiled output of the Cloud Functions, not source.
    ignores: ["dist/*", "functions/lib/*"],
  }
]);
