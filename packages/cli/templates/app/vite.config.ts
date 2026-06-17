import { dashboardWriteback } from "@zframes/core/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @zframes/* are vendored under packages/ and ship TypeScript source; Vite
// transforms them directly (no prebuilt dist), so keep them out of optimizeDeps.
export default defineConfig({
  // dashboardWriteback persists in-browser editor changes to src/dashboard.json.
  plugins: [react(), tailwindcss(), dashboardWriteback()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
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
  },
});
