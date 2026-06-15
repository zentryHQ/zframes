#!/usr/bin/env node
// Vendor the workspace runtime packages into the CLI's scaffold template.
//
// `zframes init` copies templates/app/ verbatim into the user's new project, so
// templates/app/packages/ must be a fresh, build-artifact-free copy of the repo's
// packages/* (minus the CLI itself). Run automatically by `pnpm build:cli`; the
// synced copy is gitignored — it's a derived artifact, regenerated on each build.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..", ".."); // packages/cli/scripts -> repo root
const srcPackages = join(repoRoot, "packages");
const destPackages = join(scriptDir, "..", "templates", "app", "packages");

const EXCLUDE_PKGS = new Set(["cli"]); // never vendor the CLI into its own template
const EXCLUDE_ENTRIES = new Set(["node_modules", "dist", ".turbo", ".vite"]);

/** Skip build artifacts and dep trees so the template stays a clean source copy. */
function filter(src) {
  const base = basename(src);
  if (EXCLUDE_ENTRIES.has(base)) return false;
  if (base === ".DS_Store" || base.endsWith(".tsbuildinfo")) return false;
  return true;
}

rmSync(destPackages, { recursive: true, force: true });
mkdirSync(destPackages, { recursive: true });

const pkgs = readdirSync(srcPackages).filter((name) => {
  if (EXCLUDE_PKGS.has(name)) return false;
  const dir = join(srcPackages, name);
  return statSync(dir).isDirectory() && existsSync(join(dir, "package.json"));
});

for (const name of pkgs) {
  cpSync(join(srcPackages, name), join(destPackages, name), { recursive: true, filter });
}

console.log(`synced ${pkgs.length} package(s) into templates/app/packages: ${pkgs.join(", ")}`);
