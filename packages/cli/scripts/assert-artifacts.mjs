#!/usr/bin/env node
// Publish-time guard: fail the pack/publish if the two shipped artifacts — the
// CLI bundle (dist/) and the vendored browser runtime (runtime/) — are missing
// or empty. Runs as the LAST step of `build` and `prepack`, so a broken or
// partial build can never reach the npm tarball.
//
// Without this, the only check is at `zframes serve` time (src/serve.ts), which
// fails on the user's machine — far too late. `runtime/` is gitignored and only
// produced by build-runtime.mjs, so "packed without building" is a real footgun
// this closes loudly at the source.
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

/** A file must exist and be non-empty. */
function requireFile(relPath, hint) {
  const abs = join(cliRoot, relPath);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    errors.push(`missing ${relPath} — ${hint}`);
  } else if (statSync(abs).size === 0) {
    errors.push(`${relPath} is empty — ${hint}`);
  }
}

// The CLI binary tsup emits (bin: dist/index.js).
requireFile("dist/index.js", "run `pnpm build` (tsup) to emit it");
// The vendored runtime: index.html plus at least one built JS asset, so we
// catch an empty shell, not just a missing file.
requireFile("runtime/index.html", "run `pnpm build:cli` to vendor the runtime");

const assetsDir = join(cliRoot, "runtime", "assets");
const hasJsAsset =
  existsSync(assetsDir) &&
  readdirSync(assetsDir).some((f) => f.endsWith(".js"));
if (!hasJsAsset) {
  errors.push(
    "runtime/assets has no .js bundle — the playground build produced no app; run `pnpm build:cli`",
  );
}

if (errors.length > 0) {
  console.error("✗ zframes artifact check failed — refusing to pack/publish:");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}

console.log("✓ artifacts present: dist/index.js + runtime/ (index.html + js)");
