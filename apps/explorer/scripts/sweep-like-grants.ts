/**
 * Delete like-allowance rows nothing will read again.
 *
 *   pnpm --dir apps/explorer sweep:likes
 *
 * `like_grants` holds one row per (visitor, item, UTC day) and the cap only ever
 * consults today's bucket, so yesterday's rows are dead weight. Without this the
 * table grows forever — and it is the one table here whose rows are keyed by a
 * visitor fingerprint, so keeping them past their purpose would quietly turn a
 * short-lived counter into a visitor log.
 *
 * Runs on the nightly cron rather than on the request path: a delete per like would
 * add write work to the hot path to save a job that runs once a day.
 *
 * Deliberately NOT wired into the deploy workflow — this is maintenance, not a
 * migration, and a failure here must never block a release.
 */
import { assertDatabaseUrl, databaseUrl } from "./database-url";

// MUST come before any import that reaches app/lib/db — that module reads
// process.env at import time and THROWS on a missing DATABASE_URL. A static
// `import … from "../app/lib/likes"` at the top of this file therefore died before
// main() ever ran, which is why every sibling script does it exactly this way:
// resolve and shape-check the URL first, assign it back into the env, then
// dynamic-import the db-touching modules below.
process.env.DATABASE_URL = assertDatabaseUrl(databaseUrl());

async function main() {
  const { GRANT_RETENTION_DAYS } = await import("../app/lib/likes-cap");
  const { sweepLikeGrants } = await import("../app/lib/likes");

  const deleted = await sweepLikeGrants(new Date());
  console.log(
    `swept ${deleted} like-grant row(s) older than ${GRANT_RETENTION_DAYS} day(s)`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
