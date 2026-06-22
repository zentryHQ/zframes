import { defineConfig } from "vitest/config";

// Tests run in the Node environment: every covered unit (the serve handlers, the
// spec schema, lintSpec) is Node-only or pure — none touch the DOM. Workspace
// `@zframes/*` packages resolve via pnpm symlinks + each package's exports map,
// the same path the runtime app's Vite build already exercises.
export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/runtime/**"],
  },
});
