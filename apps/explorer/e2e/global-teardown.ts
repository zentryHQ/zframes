import { execFileSync } from "node:child_process";
import { APP_DIR, COMPOSE_FILE, COMPOSE_PROJECT } from "./playwright.config";

// Remove the e2e database container (it has no volume — the data goes with it).
// E2E_KEEP_DB=1 keeps it up for debugging a failed run against live state.
export default function globalTeardown() {
  if (process.env.E2E_KEEP_DB) return;
  execFileSync(
    "docker",
    ["compose", "-p", COMPOSE_PROJECT, "-f", COMPOSE_FILE, "down"],
    { cwd: APP_DIR, stdio: "inherit" },
  );
}
