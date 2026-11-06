// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // functions/lib is the compiled output of the Cloud Functions, not source.
    ignores: ["dist/*", "functions/lib/*"],
  },
  {
    // UI rule from AGENTS.md: uppercase text comes from the Typography styles.
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "Property[key.name='textTransform'][value.value='uppercase']",
        message: "Use Typography.sectionLabel for a section heading or Typography.eyebrow for a small tag, not your own uppercase style.",
      }],
    },
  },
]);
