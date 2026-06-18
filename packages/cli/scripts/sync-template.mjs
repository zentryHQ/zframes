#!/usr/bin/env node
// Vendor the workspace runtime + the shared app shell into the CLI scaffold template.
//
// `zframes init` copies templates/app/ verbatim into the user's new project. Two
// things must stay in lockstep with this repo, so we regenerate them on every
// build (and they're gitignored — derived artifacts, never hand-edited):
//
//   1. templates/app/packages/  — a build-artifact-free copy of packages/* (minus cli).
//   2. the shared app shell      — index.html + src/{App,main,background}.tsx + styles.css,
//                                  copied from apps/playground so the scaffold can never
//                                  drift from what we dogfood. styles.css has its Tailwind
//                                  @source paths rewritten for the scaffold's flatter
//                                  layout. Files that legitimately differ (vite.config.ts,
//                                  dashboard.json) stay template-owned and committed.
//
// Run automatically by `pnpm build:cli` / `prepack`.
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..", ".."); // packages/cli/scripts -> repo root
const srcPackages = join(repoRoot, "packages");
const templateApp = join(scriptDir, "..", "templates", "app");
const destPackages = join(templateApp, "packages");
const srcApp = join(repoRoot, "apps", "playground");

const EXCLUDE_PKGS = new Set(["cli"]); // never vendor the CLI into its own template
const EXCLUDE_ENTRIES = new Set(["node_modules", "dist", ".turbo", ".vite"]);

/** Skip build artifacts and dep trees so the template stays a clean source copy. */
function filter(src) {
  const base = basename(src);
  if (EXCLUDE_ENTRIES.has(base)) return false;
  if (base === ".DS_Store" || base.endsWith(".tsbuildinfo")) return false;
  return true;
}

// 1. Runtime packages -------------------------------------------------------
rmSync(destPackages, { recursive: true, force: true });
mkdirSync(destPackages, { recursive: true });

const pkgs = readdirSync(srcPackages).filter((name) => {
  if (EXCLUDE_PKGS.has(name)) return false;
  const dir = join(srcPackages, name);
  return statSync(dir).isDirectory() && existsSync(join(dir, "package.json"));
});

for (const name of pkgs) {
  cpSync(join(srcPackages, name), join(destPackages, name), {
    recursive: true,
    filter,
  });
}

// 2. Shared app shell -------------------------------------------------------
// Verbatim from the playground (vite.config.ts and dashboard.json are NOT here —
// they legitimately differ and stay committed in the template).
mkdirSync(join(templateApp, "src"), { recursive: true });
copyFileSync(join(srcApp, "index.html"), join(templateApp, "index.html"));
for (const file of ["App.tsx", "main.tsx", "background.tsx"]) {
  copyFileSync(join(srcApp, "src", file), join(templateApp, "src", file));
}

// styles.css is identical except for the Tailwind @source paths: the playground
// reaches up to ../../../packages, the scaffold has them vendored at ../packages.
const styles = readFileSync(
  join(srcApp, "src", "styles.css"),
  "utf8",
).replaceAll("../../../packages/", "../packages/");
writeFileSync(join(templateApp, "src", "styles.css"), styles);

console.log(
  `synced ${pkgs.length} package(s) + app shell into templates/app: ${pkgs.join(", ")}`,
);
