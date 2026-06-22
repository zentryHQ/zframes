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
      "@zframes/provider-coinpaprika",
      "@zframes/provider-defillama",
      "@zframes/provider-deribit",
      "@zframes/provider-finra",
      "@zframes/provider-hyperliquid",
      "@zframes/provider-mempool",
      "@zframes/provider-nyfed",
      "@zframes/provider-sec",
      "@zframes/provider-treasury",
    ],
  },
  build: {
    rollupOptions: {
      output: {
        // Peel the heavy third-party libs off the entry chunk so the dashboard
        // paints without waiting on them and they cache independently. The
        // editor is split automatically by the React.lazy import in App.tsx;
        // these are the libs the editor + charts pull in. Function form (not
        // object form) because charts/frames are consumed as workspace TS
        // source, not as resolvable node_modules package names.
        manualChunks(id) {
          // react/react-dom/scheduler — peeled off the entry so it caches
          // across deploys (the substring can't match lucide-react /
          // unicornstudio-react: those are `node_modules/<name>-react`).
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/scheduler")
          )
            return "react";
          if (
            id.includes("node_modules/d3") ||
            id.includes("node_modules/internmap") ||
            id.includes("node_modules/delaunator") ||
            id.includes("node_modules/robust-predicates")
          )
            return "d3";
          if (id.includes("node_modules/gridstack")) return "gridstack";
          if (id.includes("node_modules/liveline")) return "liveline";
        },
      },
    },
  },
  server: {
    port: 37263,
    strictPort: true,
    fs: { allow: ["../.."] },
  },
});
