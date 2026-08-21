import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";
import type { Plugin } from "vite";
// Imported by package subpath, never a relative path: this file runs through
// Vite's Node config loader, where an extensionless relative import fails (the
// same contract packages/vite/src/vite.ts documents).
import { DASHBOARD_PROXY_ROUTE, handleProxy } from "@zframes/serve/serve";
import { PROXY_ALLOW_HOSTS } from "@zframes/serve/proxy-allowlist";

const here = dirname(fileURLToPath(import.meta.url));
// .storybook → apps/storybook → apps → repo root
const repoRoot = resolve(here, "../../..");

/**
 * The same-origin official-data proxy, mirroring the dev plugin and the CLI's
 * `serve`. The `Live` story needs it: roughly a third of the keyless providers
 * (SEC, Treasury, FRED, FINRA, OFR, BLS, FHFA, parts of metals) read hosts that
 * are CORS-blocked in the browser, and pass `proxied: true` — without this
 * route those frames render *empty*, which looks like a frame bug rather than a
 * missing server.
 *
 * Dev-server only. `storybook build` output is static, so a Live story served
 * from `storybook-static` degrades to empty for exactly those providers.
 */
function officialDataProxy(): Plugin {
  return {
    name: "zframes-storybook-proxy",
    configureServer(server) {
      server.middlewares.use(DASHBOARD_PROXY_ROUTE, (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        // The relay allows nothing on its own, so a mount that wants reach has
        // to name it. Storybook's Live story bundles the keyless fleet
        // (src/live-providers.ts), so it passes that fleet's list, exactly as
        // the CLI and vite mounts do.
        void handleProxy(req, res, { allowHosts: PROXY_ALLOW_HOSTS });
      });
    },
  };
}

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
      plugins: [tailwindcss(), officialDataProxy()],
      // workspace packages ship TypeScript source; let Vite transform them
      optimizeDeps: {
        exclude: [
          "@zframes/core",
          "@zframes/spec",
          "@zframes/editor",
          "@zframes/frames",
          "@zframes/charts",
          "@zframes/provider-demo",
          "@zframes/providers-keyless",
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
