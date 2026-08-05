/**
 * Validate every dashboard currently in the database.
 *
 *   pnpm --dir apps/explorer validate:dashboards            # all boards
 *   pnpm --dir apps/explorer validate:dashboards --curated  # showcase only
 *
 * WHY THIS EXISTS. `tests/curated-specs.test.tsx` used to validate the showcase at
 * CI time, because the boards were TypeScript. They are rows now (2026-08-05), and
 * a jsonb column cannot fail a build — so the same checks have to run *against the
 * data*, on a schedule, rather than against the source at compile time.
 *
 * `validateDashboardSpec` gates every WRITE, so a board cannot enter the table
 * broken. What it cannot catch is a board that was valid when written and became
 * invalid later — which is the common case, not the rare one: renaming a frame,
 * dropping a `lazy.ts` loader, renaming a config field or tightening an enum all
 * invalidate stored boards without touching them. That is exactly the failure the
 * old test existed to prevent, and this is where it now gets caught.
 *
 * Exits non-zero when any board fails, so it can run as a scheduled monitor
 * alongside the provider-liveness and frame-render suites (see
 * .github/scripts/README.md) and file an issue rather than gate a PR.
 */
import { writeFileSync } from "node:fs";
import {
  formatProblems,
  validateDashboardSpec,
} from "../app/lib/validate-spec";
import { assertDatabaseUrl, databaseUrl } from "./database-url";

// Same default as the other scripts; set before the db module is imported (it
// throws at import time on a missing DATABASE_URL).
// Trimmed, defaulted and shape-checked before the db module is reached — see
// scripts/database-url.ts. Assigned back into the env because the db module reads
// process.env at import time.
process.env.DATABASE_URL = assertDatabaseUrl(databaseUrl());

async function main() {
  const curatedOnly = process.argv.includes("--curated");
  const { db } = await import("../app/lib/db");
  const { dashboards } = await import("../app/lib/db/schema");
  const { and, eq, ne } = await import("drizzle-orm");

  const rows = await db
    .select({
      id: dashboards.id,
      title: dashboards.title,
      curated: dashboards.curated,
      spec: dashboards.spec,
    })
    .from(dashboards)
    .where(
      curatedOnly
        ? and(eq(dashboards.curated, true), ne(dashboards.status, "removed"))
        : ne(dashboards.status, "removed"),
    );

  if (rows.length === 0) {
    // Not a pass. An empty table means the showcase is missing — the gallery and
    // the landing page would render empty and nothing else would complain.
    report(
      "monitor: the dashboards table is empty",
      "No dashboards in the database. The gallery and the landing showcase render empty.\n\nSeed them:\n\n```\npnpm --dir apps/explorer seed:curated\n```",
      1,
    );
    console.error(
      "✗ no dashboards in the database. Seed them: pnpm --dir apps/explorer seed:curated",
    );
    process.exit(1);
  }

  const broken: string[] = [];
  for (const row of rows) {
    const result = validateDashboardSpec(row.spec);
    if (result.ok) continue;
    broken.push(
      `${row.curated ? "curated" : "community"} "${row.id}" (${row.title}):\n${formatProblems(
        result.problems,
      )}`,
    );
  }

  const curatedCount = rows.filter((r) => r.curated).length;
  console.log(
    `checked ${rows.length} dashboard(s) — ${curatedCount} curated, ${rows.length - curatedCount} community`,
  );

  if (broken.length) {
    report(
      `monitor: ${broken.length} stored dashboard(s) no longer validate`,
      `Checked ${rows.length} dashboard(s) — ${curatedCount} curated, ${rows.length - curatedCount} community.\n\n` +
        "These were valid when written and are not now, so something in the frame registry moved under them — a renamed frame, a dropped loader, a renamed config field, a tightened enum.\n\n" +
        `\`\`\`\n${broken.join("\n\n")}\n\`\`\``,
      broken.length,
    );
    console.error(`\n✗ ${broken.length} invalid:\n\n${broken.join("\n\n")}`);
    process.exit(1);
  }
  report("", "", 0);
  console.log("✓ every stored dashboard still validates against the registry");
}

/**
 * Emit the report shape `.github/scripts/report-to-issue.mjs --kind generic`
 * consumes, so this joins the existing scheduled-monitor machinery (one issue,
 * updated in place, auto-closed when clean) rather than inventing its own.
 * `findingsCount: 0` is what closes the issue.
 */
function report(title: string, body: string, findingsCount: number) {
  writeFileSync(
    process.env.DASHBOARD_VALIDITY_REPORT ?? "dashboard-validity-report.json",
    `${JSON.stringify({ title, body, findingsCount, generatedAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
