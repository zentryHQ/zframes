import { defineConfig } from "vitest/config";

// Default environment is Node (serve handlers, spec schema, lintSpec, …);
// DOM-touching suites opt in per-file via a `@vitest-environment jsdom`
// docblock (renderer, editor-config, live-tick, frame-smoke, facade-parity).
// Workspace `@zframes/*` packages resolve via pnpm symlinks + each package's
// exports map, the same path the runtime app's Vite build already exercises.
// `tests/` holds repo-level guard tests (e.g. the package-dependency DAG).
export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/runtime/**"],
  },
});
