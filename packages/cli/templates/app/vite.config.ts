import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @zframes/* are vendored under packages/ and ship TypeScript source; Vite
// transforms them directly (no prebuilt dist), so keep them out of optimizeDeps.
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  },
});
