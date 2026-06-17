import { dashboardWriteback } from "@zframes/core/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // dashboardWriteback persists in-browser editor changes to src/dashboard.json.
  plugins: [react(), tailwindcss(), dashboardWriteback()],
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
      "@zframes/provider-coingecko",
      "@zframes/provider-defillama",
      "@zframes/provider-hyperliquid",
    ],
  },
  server: {
    port: 5179,
    strictPort: true,
    fs: { allow: ["../.."] },
  },
});
