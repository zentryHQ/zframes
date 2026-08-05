/**
 * Apply pending SQL migrations from `drizzle/`, exactly once each, in order.
 *
 *   pnpm --dir apps/explorer migrate            # apply pending
 *   pnpm --dir apps/explorer migrate --dry-run  # list pending, apply nothing
 *
 * WHY A RUNNER AND NOT `drizzle-kit push`. `push` diffs the schema against the
 * live database at run time and applies whatever comes out. That is fine at a
 * terminal, where it prints the plan and waits — and unacceptable in CI, where
 * you would pass `--force` and thereby suppress the one prompt that would have
 * stopped it. It also reads a column rename as drop-then-add, which loses data.
 * With files, the SQL that runs is the SQL that was reviewed in the pull request.
 *
 * WHY NOT `drizzle-kit migrate`. It is the obvious choice and would be right on a
 * greenfield database. Adopting it here means baselining databases whose tables
 * already exist (prod, plus every dev machine), which drizzle-kit has no
 * first-class command for — the workaround is hand-writing rows into its private
 * journal table and keeping its snapshot metadata consistent by hand. This runner
 * is ~40 lines of transparent SQL bookkeeping instead, and the migrations stay
 * plain files that `drizzle-kit generate` can still author.
 *
 * CONTRACT FOR A MIGRATION FILE:
 *   • `drizzle/NNNN_name.sql`, applied in filename order.
 *   • Idempotent where it can be (`IF NOT EXISTS`) — the baseline has to be, since
 *     it runs against databases that already have the tables.
 *   • Additive or constraint-relaxing whenever the previous release is still
 *     serving traffic, which during a deploy it always is.
 *   • Each file runs inside ONE transaction with its bookkeeping row, so a partial
 *     apply cannot be recorded as done.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
);

// Same default as the sibling scripts: the local PGlite socket, so a dev run needs
// no env at all.
// `.trim()` is load-bearing: a secret set from a paste can carry a leading space
// or a trailing newline, and the `postgres` driver feeds the raw string to
// `new URL()`, which throws ERR_INVALID_URL and prints the value MASKED
// (`input: ' ***'`) — so the offending character is invisible in CI logs. That cost
// a production outage on 2026-08-05.
const DATABASE_URL =
  process.env.DATABASE_URL?.trim() ||
  "postgres://postgres:postgres@127.0.0.1:5433/postgres";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) throw new Error(`no .sql files in ${MIGRATIONS_DIR}`);

  // max 1: the dev PGlite socket handles one wire connection at a time (see
  // app/lib/db). Migrations are sequential anyway.
  const sql = postgres(DATABASE_URL, {
    prepare: false,
    max: 1,
    idle_timeout: 2,
    onnotice: () => {}, // "already exists, skipping" from the idempotent DDL
  });

  try {
    await sql`
      create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `;
    const applied = new Set(
      (await sql<{ name: string }[]>`select name from schema_migrations`).map(
        (r) => r.name,
      ),
    );
    const pending = files.filter((f) => !applied.has(f));

    console.log(
      `${files.length} migration(s) on disk · ${applied.size} applied · ${pending.length} pending`,
    );
    if (pending.length === 0) {
      console.log("✓ database is up to date");
      return;
    }
    for (const f of pending) console.log(`  pending: ${f}`);
    if (dryRun) {
      console.log("\n--dry-run: nothing applied.");
      return;
    }

    for (const file of pending) {
      const body = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      // The file and its bookkeeping row commit together — a migration that fails
      // half way leaves NOTHING recorded, so a re-run retries it rather than
      // skipping past a partial apply.
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      console.log(`  ✓ applied ${file}`);
    }
    console.log(`\n✓ ${pending.length} migration(s) applied`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(
    "\n✗ migration failed — nothing from the failing file was recorded",
  );
  console.error(err);
  process.exit(1);
});
