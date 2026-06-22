import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dashboardWriteback } from "@zframes/core/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The "runtime version" shown in the header is the `zframes` CLI version — the
// package npx fetches. This app IS the prebuilt runtime: build-runtime.mjs
// rebuilds it from this same monorepo right before tsup bundles + publishes the
// CLI, so the version read here always matches the published artifact.
const here = dirname(fileURLToPath(import.meta.url));
const runtimeVersion = JSON.parse(
  readFileSync(
    join(here, "..", "..", "packages", "cli", "package.json"),
    "utf8",
  ),
).version as string;

export default defineConfig({
  // dashboardWriteback persists in-browser editor changes to src/dashboard.json.
  plugins: [react(), tailwindcss(), dashboardWriteback()],
  define: {
    __ZFRAMES_VERSION__: JSON.stringify(runtimeVersion),
  },
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // workspace packages ship TypeScript source; let Vite transform them
    exclude: [
      "@zframes/charts",
      "@zframes/core",
      "@zframes/frames",
      "@zframes/provider-alternativeme",
      "@zframes/provider-bls",
      "@zframes/provider-coingecko",
      "@zframes/provider-defillama",
      "@zframes/provider-finra",
      "@zframes/provider-hyperliquid",
      "@zframes/provider-nyfed",
      "@zframes/provider-sec",
      "@zframes/provider-treasury",
    ],
  },
  server: {
    port: 37263,
    strictPort: true,
    fs: { allow: ["../.."] },
  },
});
