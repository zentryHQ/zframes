/**
 * Dumps every frame's identity + current `layout` as JSON, for the size-bound
 * derivation to join against the probe matrix. React-free import path, so this
 * runs under plain tsx with no bundler.
 */
import { writeFileSync } from "node:fs";
// Relative, not by package subpath: this script runs from the repo root, where
// `@zframes/frames` is not a dependency. The module is React-free, so a bare
// tsx run resolves it fine.
import * as schemas from "../../packages/frames/src/schemas.js";

type MetaLike = {
  name: string;
  label?: string;
  category: string;
  chrome?: string;
  container?: boolean;
  annotatable?: boolean;
  account?: boolean;
  capabilities?: string[];
  description?: string;
  layout?: Record<string, number>;
};

const metas = (Object.values(schemas) as unknown[]).filter(
  (v): v is MetaLike =>
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    typeof (v as MetaLike).name === "string" &&
    "schema" in (v as object),
);

const out: Record<string, unknown> = {};
for (const m of metas) {
  out[m.name] = {
    label: m.label ?? m.name,
    category: m.category,
    chrome: m.chrome ?? "card",
    container: !!m.container,
    annotatable: !!m.annotatable,
    account: !!m.account,
    capabilities: m.capabilities ?? [],
    description: (m.description ?? "").slice(0, 240),
    layout: m.layout ?? null,
  };
}

const path = process.env.META_OUT ?? "frame-meta.json";
writeFileSync(path, JSON.stringify(out, null, 0));
console.log(`wrote ${Object.keys(out).length} frame metas → ${path}`);
