import { execFileSync } from "node:child_process";
import {
  APP_DIR,
  COMPOSE_FILE,
  COMPOSE_PROJECT,
  E2E_DATABASE_URL,
} from "./playwright.config";

function run(cmd: string, args: string[], env: Record<string, string> = {}) {
  execFileSync(cmd, args, {
    cwd: APP_DIR,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

// Boot the throwaway Postgres, then the same first-run-on-a-machine sequence the
// dev database gets: migrate → seed:curated. `up --wait` blocks on the
// healthcheck, so migrate can't race an unready server.
export default function globalSetup() {
  run("docker", [
    "compose",
    "-p",
    COMPOSE_PROJECT,
    "-f",
    COMPOSE_FILE,
    "up",
    "-d",
    "--wait",
  ]);
  const env = { DATABASE_URL: E2E_DATABASE_URL };
  run("pnpm", ["exec", "tsx", "scripts/migrate.ts"], env);
  run("pnpm", ["exec", "tsx", "scripts/seed-curated.ts"], env);
}
