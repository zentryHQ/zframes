/**
 * Seed / re-seed the curated showcase into the `dashboards` table.
 *
 *   pnpm --dir apps/explorer seed:curated            # upsert from curated-seed.json
 *   pnpm --dir apps/explorer seed:curated --dry-run  # validate only, write nothing
 *
 * WHY A SEED FILE AND NOT THE OLD TS MODULE. The showcase moved out of
 * `app/lib/curated-dashboards.ts` and into the database (2026-08-05), so the
 * table is the source of truth: boards are edited with SQL or an authoring UI, no
 * deploy required. `curated-seed.json` is NOT a second source of truth — it is
 * the one-time export of that module, kept so a fresh database (a new dev
 * machine, a CI run, a rebuilt Neon branch) can be brought to a known-good state
 * without hand-writing 18 boards. Editing the JSON does nothing until someone
 * runs this script; editing the table takes effect immediately.
 *
 * Every board is validated by `validateDashboardSpec` before any write, and a
 * single failure aborts the WHOLE run (see below) — a half-seeded showcase is
 * worse than an unseeded one, because the gallery would look fine and be missing
 * boards.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatProblems,
  validateDashboardSpec,
} from "../app/lib/validate-spec";
import { assertDatabaseUrl, databaseUrl } from "./database-url";

// Same default as scripts/capture-thumbs.ts: the local PGlite socket, so a dev
// run needs no env at all. Set BEFORE the db module is reached — `app/lib/db`
// throws on a missing DATABASE_URL at import time, and a static import of
// `../app/lib/dashboards` would be hoisted above this assignment. Hence the
// dynamic import in `main()`.
// Trimmed, defaulted and shape-checked before the db module is reached — see
// scripts/database-url.ts. Assigned back into the env because the db module reads
// process.env at import time.
process.env.DATABASE_URL = assertDatabaseUrl(databaseUrl());

type SeedEntry = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  landingOrder: number | null;
  spec: unknown;
};

const here = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(here, "curated-seed.json");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const entries = JSON.parse(readFileSync(SEED_PATH, "utf8")) as SeedEntry[];
  console.log(
    `${entries.length} curated board(s) in ${SEED_PATH.replace(process.cwd(), ".")}`,
  );

  // ── validate everything first ──────────────────────────────────────────────
  // Two passes on purpose. Validating inside the write loop would leave the table
  // half-updated when board 12 is broken, and "the gallery is missing six boards"
  // is a harder failure to notice than "the seed refused to run".
  const validated: { entry: SeedEntry; spec: unknown }[] = [];
  const failures: string[] = [];
  for (const entry of entries) {
    const result = validateDashboardSpec(entry.spec);
    if (!result.ok) {
      failures.push(`${entry.id}:\n${formatProblems(result.problems)}`);
      continue;
    }
    // Store the PARSED spec, so schema defaults are materialised once in the
    // column rather than re-derived on every read.
    validated.push({ entry, spec: result.spec });
  }

  if (failures.length) {
    console.error(
      `\n✗ ${failures.length} board(s) failed validation — nothing was written:\n\n${failures.join("\n\n")}`,
    );
    process.exit(1);
  }

  const landing = validated
    .filter((v) => v.entry.landingOrder !== null)
    .sort((a, b) => a.entry.landingOrder! - b.entry.landingOrder!);
  console.log(
    `✓ all ${validated.length} valid · ${landing.length} on the landing page: ${landing
      .map((v) => v.entry.id)
      .join(" → ")}`,
  );

  if (dryRun) {
    console.log("\n--dry-run: no writes.");
    return;
  }

  // Imported here, not at the top: see the DATABASE_URL note above. A --dry-run
  // therefore needs no database at all, which is what makes it usable in CI.
  const { upsertCurated } = await import("../app/lib/dashboards");

  for (const { entry, spec } of validated) {
    await upsertCurated({
      id: entry.id,
      title: entry.title,
      description: entry.description,
      spec,
      tags: entry.tags,
      landingOrder: entry.landingOrder,
    });
    process.stdout.write(`  upserted ${entry.id}\n`);
  }
  console.log(`\n✓ ${validated.length} curated board(s) in the database.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
