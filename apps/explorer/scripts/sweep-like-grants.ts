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
import { GRANT_RETENTION_DAYS } from "@/app/lib/likes-cap";
import { sweepLikeGrants } from "@/app/lib/likes";

async function main() {
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
