// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

// UI rule from AGENTS.md: every font size comes from a role in
// constants/typography.ts. Warns on a fontSize written into a style, so new
// code picks a role and the warnings left over are the backlog to migrate.
const typographyPlugin = {
  rules: {
    "no-own-font-size": {
      meta: { type: "suggestion", schema: [] },
      create(context) {
        return {
          Property(node) {
            if (node.key && (node.key.name === "fontSize" || node.key.value === "fontSize")) {
              context.report({
                node,
                message: "Use a Typography role (cardTitle, cardSubtitle, cardMeta, cardValue, tileLabel, tileNumber, heroNumber, ...) instead of your own fontSize. A size the scale lacks becomes a new role in constants/typography.ts.",
              });
            }
          },
        };
      },
    },
  },
};

module.exports = defineConfig([
  expoConfig,
  {
    // functions/lib is the compiled output of the Cloud Functions, not source.
    ignores: ["dist/*", "functions/lib/*"],
  },
  {
    // UI rule from AGENTS.md: uppercase text comes from the Typography styles.
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    plugins: { nomadu: typographyPlugin },
    rules: {
      "nomadu/no-own-font-size": "warn",
      "no-restricted-syntax": ["error", {
        selector: "Property[key.name='textTransform'][value.value='uppercase']",
        message: "Use Typography.sectionLabel for a section heading or Typography.eyebrow for a small tag, not your own uppercase style.",
      }],
    },
  },
]);
