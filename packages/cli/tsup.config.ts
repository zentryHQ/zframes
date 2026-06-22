import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  clean: true,
  // Workspace packages ship TS source — bundle them so the built CLI's only
  // runtime dependencies are the third-party libs in package.json (zod, sirv).
  noExternal: [/^@zframes\//],
});
