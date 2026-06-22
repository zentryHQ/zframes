#!/usr/bin/env node
// Build the runtime app into a static browser bundle and vendor it into the CLI
// as the prebuilt runtime that `zframes serve` ships. The runtime app must build
// with the monorepo intact (Tailwind @source globs + @zframes/* consumed as
// source), so this owns that ordering and runs before tsup on every
// build/prepack. Replaces the old sync-template.mjs (the scaffold is gone).
//
// Two "runtime"s, kept distinct here:
//   appDist    = apps/runtime/dist     — the Vite build output of the source app
//   runtimeDir = packages/cli/runtime  — where that bundle is vendored (gitignored)
import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..", ".."); // packages/cli/scripts -> repo root
const appDist = join(repoRoot, "apps", "runtime", "dist");
const runtimeDir = join(scriptDir, "..", "runtime"); // packages/cli/runtime

console.log("building runtime bundle…");
execSync("pnpm --filter @zframes/runtime build", {
  cwd: repoRoot,
  stdio: "inherit",
});

if (!existsSync(join(appDist, "index.html"))) {
  console.error(`✗ runtime build produced no index.html at ${appDist}`);
  process.exit(1);
}

rmSync(runtimeDir, { recursive: true, force: true });
cpSync(appDist, runtimeDir, { recursive: true });

// Dev-only dogfood data lives in the runtime app's public/ for `pnpm dev`, but it
// must NOT ship in the runtime bundle: there it would shadow the daily-brief the
// user keeps next to their own dashboard.json (bundle assets win over the user
// dir in `zframes serve`).
rmSync(join(runtimeDir, "daily-analysis.json"), { force: true });

console.log(`✓ vendored runtime bundle into ${runtimeDir}`);
