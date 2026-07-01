import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";

const here = dirname(fileURLToPath(import.meta.url));
// .storybook → apps/storybook → apps → repo root
const repoRoot = resolve(here, "../../..");

const config: StorybookConfig = {
  stories: ["../src/stories/**/*.stories.tsx"],
  addons: [],
  framework: { name: "@storybook/react-vite", options: {} },
  core: { disableTelemetry: true },
  // The react-vite framework already wires @vitejs/plugin-react, so we only add
  // Tailwind v4 + the workspace-source handling the runtime uses.
  async viteFinal(viteConfig) {
    const { mergeConfig } = await import("vite");
    return mergeConfig(viteConfig, {
      plugins: [tailwindcss()],
      // workspace packages ship TypeScript source; let Vite transform them
      optimizeDeps: {
        exclude: [
          "@zframes/core",
          "@zframes/spec",
          "@zframes/editor",
          "@zframes/frames",
          "@zframes/charts",
        ],
      },
      // symlinked workspace deps can double-load React → invalid hook calls
      resolve: { dedupe: ["react", "react-dom"] },
      // allow serving the workspace TS source + Tailwind @source dirs
      server: { fs: { allow: [repoRoot] } },
    });
  },
};

export default config;
