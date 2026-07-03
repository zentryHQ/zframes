// Nightly dashboard screenshots — captures a real browser render of every
// gallery dashboard (curated + listed community) and upserts it into the
// `dashboard_thumbs` table, which /api/thumbs/[id] serves and the gallery
// cards fade in over their SVG mini-map fallback.
//
//   pnpm --filter @zframes/explorer thumbs:capture
//
// Env:
//   DATABASE_URL           postgres to write into (default: local PGlite socket)
//   EXPLORER_BASE_URL      site to screenshot (default: http://localhost:37264)
//   THUMBS_BROWSER_CHANNEL playwright channel (default "chrome" — the system
//                          Chrome, so `pnpm install` never downloads a browser;
//                          playwright-core ships no binaries)
//   THUMBS_SETTLE_MS       extra wait after frames mount, for live data/charts
//                          to paint (default 9000)
//
// Gotcha (repo-known): the runtime keeps a persistent WebSocket, so
// `networkidle` NEVER settles — wait on `.zf-frame` in the DOM instead, then a
// fixed settle for chart data.

import { chromium } from "playwright-core";
import postgres from "postgres";
import { CURATED } from "../app/lib/curated-dashboards";

const BASE = (
  process.env.EXPLORER_BASE_URL ?? "http://localhost:37264"
).replace(/\/$/, "");
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5433/postgres";
const CHANNEL = process.env.THUMBS_BROWSER_CHANNEL ?? "chrome";
const SETTLE_MS = Number(process.env.THUMBS_SETTLE_MS ?? 9000);

// Below this a jpeg is a blank/near-blank frame (dark solid ~2-4 KB) — treat
// the capture as failed rather than overwrite a good thumb with an empty one.
const MIN_BYTES = 5_000;

async function main() {
  // max 1: sequential anyway, and the dev PGlite socket handles one wire
  // connection at a time (same serialization as app/lib/db). idle_timeout
  // releases the socket between upserts so the app can query the DB while a
  // capture is in flight — without it, script and app deadlock each other on
  // the single-connection dev socket (Neon just reconnects, harmless).
  const sql = postgres(DATABASE_URL, {
    prepare: false,
    max: 1,
    idle_timeout: 2,
    onnotice: () => {}, // "already exists, skipping" from the bootstrap DDL
  });

  // Idempotent bootstrap so a fresh DB (or first run before a drizzle-kit
  // push) never fails the cron. Mirrors dashboardThumbs in app/lib/db/schema.ts.
  await sql`
    create table if not exists dashboard_thumbs (
      id text primary key,
      image bytea not null,
      content_type text not null default 'image/jpeg',
      captured_at timestamp not null default now()
    )
  `;

  const community = await sql<{ id: string }[]>`
    select id from dashboards
    where visibility = 'listed' and status = 'approved'
  `.catch(() => []); // no dashboards table yet → curated only
  const targets = [...CURATED.map((d) => d.id), ...community.map((r) => r.id)];

  if (targets.length === 0) {
    console.log("no dashboards to capture");
    await sql.end();
    return;
  }
  console.log(`capturing ${targets.length} dashboards from ${BASE}`);

  const browser = await chromium.launch({ headless: true, channel: CHANNEL });
  // 16:9 to match the gallery card window; tall boards get object-top cropped.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 810 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });

  const ok: string[] = [];
  const failed: string[] = [];

  for (const id of targets) {
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/d/${id}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForSelector(".zf-frame", { timeout: 45_000 });
      await page.waitForTimeout(SETTLE_MS);

      // The site nav is sticky — a board taller than the viewport makes the
      // element screenshot scroll-stitch, smearing the nav into the capture.
      // Hide it (and the preview page's own header row) for a clean board shot.
      await page.addStyleTag({
        content: "header { display: none !important; }",
      });

      const image = await page
        .locator(".zf-grid")
        .first()
        .screenshot({ type: "jpeg", quality: 80, timeout: 30_000 });
      if (image.length < MIN_BYTES)
        throw new Error(`capture too small (${image.length}B)`);

      await sql`
        insert into dashboard_thumbs (id, image, content_type, captured_at)
        values (${id}, ${image}, 'image/jpeg', now())
        on conflict (id) do update
          set image = excluded.image,
              content_type = excluded.content_type,
              captured_at = now()
      `;
      ok.push(id);
      console.log(`  ✓ ${id} (${Math.round(image.length / 1024)} KB)`);
    } catch (err) {
      failed.push(id);
      console.error(`  ✗ ${id}: ${err instanceof Error ? err.message : err}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  // Prune thumbs whose dashboard left the gallery (unlisted, removed, deleted,
  // or a curated id that was retired) so takedowns don't linger as images.
  const pruned = await sql`
    delete from dashboard_thumbs where id not in ${sql(targets)}
  `;
  await sql.end();

  console.log(
    `done: ${ok.length} captured, ${failed.length} failed, ${pruned.count} pruned`,
  );
  if (ok.length === 0) {
    console.error("every capture failed — is the site up and rendering?");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
