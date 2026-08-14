import { defineConfig } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const APP_DIR = join(here, "..");
export const COMPOSE_FILE = join(here, "docker-compose.e2e.yml");
export const COMPOSE_PROJECT = "zframes-explorer-e2e";

const PORT = 43264;
// The e2e database (docker-compose.e2e.yml) — NOT the dev :5433 one.
export const E2E_DATABASE_URL =
  "postgres://postgres:postgres@127.0.0.1:5434/postgres";

export default defineConfig({
  testDir: here,
  globalSetup: join(here, "global-setup.ts"),
  globalTeardown: join(here, "global-teardown.ts"),
  timeout: 90_000,
  use: {
    // localhost, never 127.0.0.1 — Next 16 blocks dev chunks from the raw IP
    // and boards render blank (apps/explorer/AGENTS.md § Footguns).
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    cwd: APP_DIR,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    // next dev compiles routes lazily; first paint of the landing is slow.
    timeout: 180_000,
    // Process env beats .env.local in Next, so a dev .env.local pointing at the
    // :5433 dev database (or Neon) can't leak into the run.
    env: {
      ...process.env,
      DATABASE_URL: E2E_DATABASE_URL,
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      BETTER_AUTH_SECRET:
        "e2e-only-secret-0000000000000000000000000000000000000000",
    },
  },
});
