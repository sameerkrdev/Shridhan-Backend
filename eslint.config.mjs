import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default [
  // Type-aware rules (better than `recommended`)
  ...tseslint.configs.recommendedTypeChecked,
  // Optional but good: stylistic rules
  ...tseslint.configs.stylisticTypeChecked,
  // Disable rules conflicting with Prettier
  eslintConfigPrettier,

  {
    ignores: ["dist/**", "build/**", "node_modules/**", "eslint.config.mjs"],
  },

  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: true, // auto-detect tsconfig.json
      },
      globals: globals.node,
    },
    rules: {
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
];
