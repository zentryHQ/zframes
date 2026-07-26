import { defineConfig } from "vitest/config";

// Default environment is Node (serve handlers, spec schema, lintSpec, …);
// DOM-touching suites opt in per-file via a `@vitest-environment jsdom`
// docblock (renderer, editor-config, live-tick, frame-smoke, facade-parity).
// Workspace `@zframes/*` packages resolve via pnpm symlinks + each package's
// exports map, the same path the runtime app's Vite build already exercises.
// `tests/` holds repo-level guard tests (e.g. the package-dependency DAG).
// `apps/` is collected too: the explorer's publish-boundary guards live in
// `apps/explorer/app/lib/`, outside a `src/` dir, hence the extra glob. The
// runtime exclude is scoped to `packages/cli/runtime/**` — the gitignored
// vendored copy of `apps/runtime/dist` — so it can't swallow `apps/runtime`.
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/**/src/**/*.test.{ts,tsx}",
      "apps/**/src/**/*.test.{ts,tsx}",
      "apps/explorer/app/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "packages/cli/runtime/**"],
  },
});
