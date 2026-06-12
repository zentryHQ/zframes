import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  clean: true,
  // Workspace packages ship TS source — bundle them so the built CLI runs
  // on plain node with only zod as a runtime dependency.
  noExternal: [/^@zframes\//],
});
