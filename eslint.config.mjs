import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// Lint-only: Prettier owns formatting (the `prettier` config at the end turns
// off every stylistic rule that could fight it), ESLint owns correctness. The
// high-value, type-aware rules (no-floating-promises / no-misused-promises) run
// only over source files a package tsconfig includes, so the type-checker
// project service can resolve them; config/script files get the plain rules.
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "packages/cli/runtime/**", // vendored prebuilt bundle (gitignored)
      "apps/*/public/**", // vendored SDKs (e.g. unicornStudio.umd.mjs)
      ".design-sync/**",
      ".ds-sync/**",
      "ds-bundle/**",
      "**/*.min.*",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Type-aware rules — only the source files that a package tsconfig includes,
  // so the type-checker project service can resolve them.
  {
    files: ["packages/*/src/**/*.{ts,tsx}", "apps/*/src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // A floating promise is a real unhandled-rejection risk — keep it blocking.
      "@typescript-eslint/no-floating-promises": "error",
      // async handlers passed where void is expected are usually fine here; warn.
      "@typescript-eslint/no-misused-promises": "warn",
    },
  },

  // Adoption baseline: correctness rules stay errors (above); the rules that
  // only flag pre-existing style (the `const schema = meta.schema` type-alias
  // pattern across frames, stray `any`s) run as warnings — visible and tracked
  // for incremental cleanup, but non-blocking so CI is green from day one.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // React hooks correctness where React components live (the app + every
  // package that ships .tsx components: core renderer/editor, the frames).
  {
    files: ["apps/**/*.tsx", "packages/*/src/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Plain JS / config scripts run in Node.
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: globals.node },
  },

  prettier,
);
