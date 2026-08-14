import { defineConfig } from "@playwright/test";
import { copyFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The suite serves a COPY of the fixture board from a temp dir, so the editor's
// writeback PUT mutates that copy and never dirties the repo.
const here = dirname(fileURLToPath(import.meta.url));
export const APP_DIR = join(here, "..");
export const FIXTURE = join(here, "fixtures", "dashboard.json");
export const SERVED_DASHBOARD = join(
  tmpdir(),
  "zframes-e2e-runtime",
  "dashboard.json",
);

// Reset the served copy at config-evaluation time, NOT in globalSetup:
// Playwright boots webServer BEFORE globalSetup, and its readiness URL is the
// spec read route, which 404s until this file exists.
mkdirSync(dirname(SERVED_DASHBOARD), { recursive: true });
copyFileSync(FIXTURE, SERVED_DASHBOARD);

const PORT = 43163;

export default defineConfig({
  testDir: here,
  timeout: 60_000,
  // The board under test is a single mutable dashboard.json — the writeback
  // test would race a parallel reader.
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Repo pattern (capture-thumbs.ts): drive the system Chrome instead of a
    // downloaded browser. CI installs it via `playwright install chrome`.
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec vite --configLoader runner --port ${PORT} --strictPort`,
    cwd: APP_DIR,
    url: `http://localhost:${PORT}/__zframes/dashboard.json`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      ZFRAMES_DASHBOARD_FILE: SERVED_DASHBOARD,
    },
  },
});
