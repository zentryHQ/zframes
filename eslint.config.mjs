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

  // --- Bounded-context layer boundaries (the core-split DAG) ---
  // Enforced with the built-in @typescript-eslint/no-restricted-imports (no new
  // dep). The DAG: @zframes/spec (kernel) <- everything; @zframes/core
  // (presentation) depends on spec only; @zframes/editor may use core+spec;
  // providers stay React-free; Node infra (serve/zai/account/store/vite) never
  // imports React or the presentation/authoring layers. The facade shims in
  // packages/core/src/facade/** intentionally re-export the higher packages, so
  // they are exempted (they are the whole point of the back-compat facade).
  {
    // @zframes/spec is the leaf kernel: React-runtime-free and Node-free.
    files: ["packages/spec/src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@zframes/core",
                "@zframes/core/*",
                "@zframes/editor",
                "@zframes/editor/*",
                "@zframes/data-primitives",
                "@zframes/data-primitives/*",
                "@zframes/serve",
                "@zframes/serve/*",
                "@zframes/zai",
                "@zframes/zai/*",
                "@zframes/account",
                "@zframes/account/*",
                "@zframes/store",
                "@zframes/store/*",
                "@zframes/vite",
                "@zframes/vite/*",
              ],
              message:
                "spec is the domain kernel — it must not import any higher layer.",
            },
            {
              group: ["react-dom", "react-dom/*"],
              message:
                "spec must stay React-runtime-free (a type-only React import for component types is fine; react-dom is not).",
            },
          ],
        },
      ],
    },
  },
  {
    // @zframes/core presentation: depends on spec (+ data-primitives) only.
    // The facade shims are exempt because re-exporting the higher packages is
    // exactly their job.
    files: ["packages/core/src/**/*.{ts,tsx}"],
    ignores: ["packages/core/src/facade/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@zframes/editor",
                "@zframes/editor/*",
                "@zframes/serve",
                "@zframes/serve/*",
                "@zframes/zai",
                "@zframes/zai/*",
                "@zframes/account",
                "@zframes/account/*",
                "@zframes/store",
                "@zframes/store/*",
                "@zframes/vite",
                "@zframes/vite/*",
              ],
              message:
                "core is the presentation layer — depend on @zframes/spec (and @zframes/data-primitives) only; editor/serve/zai/account/store/vite are reached only through the facade shims.",
            },
            {
              group: ["gridstack", "gridstack/*"],
              message: "gridstack belongs to @zframes/editor, not core.",
            },
          ],
        },
      ],
    },
  },
  {
    // @zframes/editor authoring UI: may use core+spec, never Node infra.
    files: ["packages/editor/src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@zframes/serve",
                "@zframes/serve/*",
                "@zframes/zai",
                "@zframes/zai/*",
                "@zframes/account",
                "@zframes/account/*",
                "@zframes/vite",
                "@zframes/vite/*",
              ],
              message: "editor is browser authoring UI — no Node-infra imports.",
            },
          ],
        },
      ],
    },
  },
  {
    // Providers are React-free data adapters over @zframes/spec + the transport.
    files: ["packages/provider-*/src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "providers are React-free data layers." },
            {
              name: "react-dom",
              message: "providers are React-free data layers.",
            },
          ],
          patterns: [
            {
              group: [
                "@zframes/editor",
                "@zframes/editor/*",
                "@zframes/serve",
                "@zframes/serve/*",
                "@zframes/zai",
                "@zframes/zai/*",
                "@zframes/account",
                "@zframes/account/*",
                "@zframes/vite",
                "@zframes/vite/*",
              ],
              message:
                "providers import @zframes/spec (types) + @zframes/core/fetch + @zframes/core/cache only.",
            },
          ],
        },
      ],
    },
  },
  {
    // Node infra never imports React or the presentation/authoring layers.
    // Cross-Node-package imports (vite composing serve/zai/account/store) are OK.
    files: ["packages/{serve,zai,account,store,vite}/src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              message: "Node infra is not a React consumer.",
            },
            {
              name: "react-dom",
              message: "Node infra is not a React consumer.",
            },
          ],
          patterns: [
            {
              group: [
                "@zframes/core",
                "@zframes/core/*",
                "@zframes/editor",
                "@zframes/editor/*",
              ],
              message:
                "Node infra depends on @zframes/spec (+ sibling Node packages); never core/editor.",
            },
          ],
        },
      ],
    },
  },

  prettier,
);
