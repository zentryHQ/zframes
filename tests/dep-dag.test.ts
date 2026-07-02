// Pins the package-level layer DAG: which @zframes packages each workspace
// package may declare under `dependencies`. ESLint polices import statements;
// this polices the manifests — a new edge (or a returning core⇄editor cycle
// after the facade repoint) must be a conscious edit to the table below.
// devDependencies are exempt: they are build/test-time only (e.g. the CLI
// inlines @zframes/* via tsup from devDependencies).
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGES_DIR = fileURLToPath(new URL("../packages", import.meta.url));

// Exact allowed sets (sorted). `core`'s editor/vite/zai/account/serve/store
// edges are facade-transitional — they exist only for src/facade/* and are
// deleted by the repoint pass (shrink this entry then).
const DAG: Record<string, string[]> = {
  spec: [],
  "data-primitives": ["@zframes/spec"],
  store: [],
  zai: ["@zframes/spec"],
  account: ["@zframes/spec", "@zframes/store"],
  serve: ["@zframes/spec"],
  vite: [
    "@zframes/account",
    "@zframes/serve",
    "@zframes/store",
    "@zframes/zai",
  ],
  editor: ["@zframes/core", "@zframes/spec"],
  core: [
    "@zframes/account",
    "@zframes/data-primitives",
    "@zframes/editor",
    "@zframes/serve",
    "@zframes/spec",
    "@zframes/store",
    "@zframes/vite",
    "@zframes/zai",
  ],
  charts: [],
  frames: ["@zframes/charts", "@zframes/core"],
  cli: [],
};

// Providers are uniform: today they reach the kernel + transport through the
// @zframes/core facade; after the repoint they use spec + data-primitives.
const PROVIDER_ALLOWED = new Set([
  "@zframes/core",
  "@zframes/spec",
  "@zframes/data-primitives",
]);

// Local-only packages excluded from the workspace (see pnpm-workspace.yaml).
const SKIP = new Set(["catalogue"]);

const zframesDeps = (name: string): string[] => {
  const manifest = JSON.parse(
    readFileSync(join(PACKAGES_DIR, name, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  return Object.keys(manifest.dependencies ?? {})
    .filter((dep) => dep.startsWith("@zframes/"))
    .sort();
};

const packageDirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !SKIP.has(entry.name))
  .map((entry) => entry.name);

describe("package-level layer DAG", () => {
  it.each(packageDirs.filter((name) => !name.startsWith("provider-")))(
    "%s declares exactly its allowed @zframes dependencies",
    (name) => {
      // A package missing from DAG fails here on purpose: adding a package
      // means declaring its layer.
      expect(DAG, `add packages/${name} to the DAG table`).toHaveProperty(name);
      expect(zframesDeps(name)).toEqual(DAG[name]);
    },
  );

  it.each(packageDirs.filter((name) => name.startsWith("provider-")))(
    "%s depends only on the kernel/transport layer",
    (name) => {
      for (const dep of zframesDeps(name)) {
        expect(PROVIDER_ALLOWED, `${name} → ${dep}`).toContain(dep);
      }
    },
  );
});
