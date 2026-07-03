// Pins the package-level layer DAG: which @zframes packages each workspace
// package may declare under `dependencies`. ESLint polices import statements;
// this polices the manifests — a new edge (or a returning core⇄editor cycle,
// retired with the facade on 2026-07-03) must be a conscious edit to the
// table below. devDependencies are exempt: they are build/test-time only
// (e.g. the CLI inlines @zframes/* via tsup from devDependencies; frames
// dev-depends on editor for the frame-smoke config seed).
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGES_DIR = fileURLToPath(new URL("../packages", import.meta.url));

// Exact allowed sets (sorted).
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
  core: ["@zframes/spec"],
  charts: [],
  frames: ["@zframes/charts", "@zframes/core", "@zframes/spec"],
  cli: [],
  // Composition leaf: aggregates the keyless provider set for the apps. Sits
  // above the providers, below the apps; imports providers + spec (the type).
  "providers-keyless": [
    "@zframes/provider-alternativeme",
    "@zframes/provider-bls",
    "@zframes/provider-coingecko",
    "@zframes/provider-coinpaprika",
    "@zframes/provider-defillama",
    "@zframes/provider-deribit",
    "@zframes/provider-finra",
    "@zframes/provider-fx",
    "@zframes/provider-hyperliquid",
    "@zframes/provider-mempool",
    "@zframes/provider-news",
    "@zframes/provider-nyfed",
    "@zframes/provider-ofr",
    "@zframes/provider-sec",
    "@zframes/provider-treasury",
    "@zframes/spec",
  ],
};

// Providers are uniform: kernel types + transport, nothing else.
const PROVIDER_ALLOWED = new Set(["@zframes/spec", "@zframes/data-primitives"]);

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
