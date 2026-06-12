import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
