// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

// UI rule from AGENTS.md: every font size comes from constants/typography.ts,
// a Typography role or a FontSize step. A number typed into a style fails.
const typographyPlugin = {
  rules: {
    "no-own-font-size": {
      meta: { type: "suggestion", schema: [] },
      create(context) {
        return {
          Property(node) {
            if (!node.key || (node.key.name !== "fontSize" && node.key.value !== "fontSize")) return;
            // A number typed in, also inside a condition (`a ? 20 : 16`).
            const hasNumber = (n) =>
              !!n && ((n.type === "Literal" && typeof n.value === "number") ||
                (n.type === "ConditionalExpression" && (hasNumber(n.consequent) || hasNumber(n.alternate))) ||
                (n.type === "BinaryExpression" && (hasNumber(n.left) || hasNumber(n.right))));
            if (hasNumber(node.value)) {
              context.report({
                node,
                message: "Use a Typography role (cardTitle, cardSubtitle, cardMeta, cardValue, tileLabel, tileNumber, heroNumber, ...), or FontSize.<step> where no role fits, instead of a number. A size the scale lacks becomes a new role in constants/typography.ts.",
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
      "nomadu/no-own-font-size": "error",
      "no-restricted-syntax": ["error", {
        selector: "Property[key.name='textTransform'][value.value='uppercase']",
        message: "Use Typography.sectionLabel for a section heading or Typography.eyebrow for a small tag, not your own uppercase style.",
      }],
    },
  },
]);
