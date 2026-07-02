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
      ".claude/**", // session worktrees + agent config (gitignored)
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
          paths: [
            {
              name: "react",
              allowTypeImports: true,
              message:
                "spec must stay React-runtime-free — type-only React imports (component types) are fine, value imports are not.",
            },
          ],
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
                // Core's own facade aliases: internal code imports siblings
                // relatively; the @zframes/core/* subpaths exist for external
                // back-compat consumers only.
                "@zframes/core",
                "@zframes/core/*",
              ],
              message:
                "core is the presentation layer — depend on @zframes/spec (and @zframes/data-primitives) only; editor/serve/zai/account/store/vite are reached only through the facade shims, and core's own facade subpaths are for external consumers.",
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
                "@zframes/store",
                "@zframes/store/*",
                "@zframes/vite",
                "@zframes/vite/*",
                // The same Node infra via core's back-compat facade aliases,
                // plus editor's own facade (editor imports itself relatively).
                "@zframes/core/serve",
                "@zframes/core/store",
                "@zframes/core/vite",
                "@zframes/core/agent",
                "@zframes/core/account",
                "@zframes/core/editor",
                "@zframes/core/editor-symbols",
              ],
              message: "editor is browser authoring UI — no Node-infra imports (direct or via @zframes/core/* facade aliases).",
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
            {
              // The core root barrel pulls in the React renderer/hooks — a
              // value import would drag React into a provider bundle. Types
              // (MarketDataProvider, Candle, …) are runtime-erased and fine
              // until the repoint pass moves providers onto @zframes/spec.
              name: "@zframes/core",
              allowTypeImports: true,
              message:
                "providers may TYPE-import @zframes/core; value imports of the React barrel are banned — use @zframes/spec / @zframes/data-primitives.",
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
                "@zframes/store",
                "@zframes/store/*",
                "@zframes/vite",
                "@zframes/vite/*",
                // The same layers via core's back-compat facade aliases. The
                // React-free facades (/fetch /cache /frame /spec /routes
                // /catalogue) stay allowed until the repoint pass.
                "@zframes/core/editor",
                "@zframes/core/editor-symbols",
                "@zframes/core/serve",
                "@zframes/core/store",
                "@zframes/core/vite",
                "@zframes/core/agent",
                "@zframes/core/account",
              ],
              message:
                "providers import @zframes/spec (types) + the transport (@zframes/data-primitives; today via the @zframes/core/fetch and /cache facades) only.",
            },
          ],
        },
      ],
    },
  },
  {
    // @zframes/data-primitives is the React-free provider transport: it may
    // import @zframes/spec (route constants) and nothing else of ours.
    files: ["packages/data-primitives/src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "data-primitives is React-free." },
            { name: "react-dom", message: "data-primitives is React-free." },
          ],
          patterns: [
            {
              group: [
                "@zframes/core",
                "@zframes/core/*",
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
                "data-primitives is a leaf transport layer — @zframes/spec is its only in-house dependency.",
            },
          ],
        },
      ],
    },
  },
  {
    // Frames compose the presentation layer (core) + charts; they never touch
    // the authoring UI or Node infra, directly or via core's facade aliases.
    // Tests are exempt: frame-smoke seeds configs via the editor's
    // buildDefaultConfig (editor-symbols) to mirror the authoring flow.
    files: ["packages/frames/src/**/*.{ts,tsx}"],
    ignores: ["packages/frames/src/**/*.test.{ts,tsx}"],
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
                "@zframes/core/editor",
                "@zframes/core/editor-symbols",
                "@zframes/core/serve",
                "@zframes/core/store",
                "@zframes/core/vite",
                "@zframes/core/agent",
                "@zframes/core/account",
              ],
              message:
                "frames build on @zframes/core (presentation) + @zframes/charts + @zframes/spec only — no authoring UI, no Node infra.",
            },
          ],
        },
      ],
    },
  },
  {
    // Charts are the implementation-agnostic base layer: no business logic,
    // no data fetching — and no @zframes imports at all.
    files: ["packages/charts/src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@zframes/*", "@zframes/*/*"],
              message:
                "charts are the generic base layer — frames own data and composition; charts must not import other @zframes packages.",
            },
          ],
        },
      ],
    },
  },
  {
    // Package-boundary escape hatches, workspace-wide. Uses the CORE
    // no-restricted-imports rule (not the @typescript-eslint one) so it
    // composes with — rather than overriding — the per-package layer rules
    // above (flat config: last matching block wins PER RULE ID).
    files: ["packages/*/src/**/*.{ts,tsx}", "apps/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../**/src/**"],
              message:
                "relative import escapes the package — import the sibling package's public subpath instead.",
            },
            {
              group: ["@zframes/*/src/**"],
              message:
                "deep import into a package's src — use its exports-map subpath instead.",
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
