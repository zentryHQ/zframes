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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import postgres from "postgres";
import { CAPTURE_WATERMARK_BAND } from "../app/lib/thumb-image";

const BASE = (
  process.env.EXPLORER_BASE_URL ?? "http://localhost:37264"
).replace(/\/$/, "");
// Trimmed — see the note in scripts/migrate.ts on why whitespace in a secret is
// so hard to spot.
const DATABASE_URL =
  process.env.DATABASE_URL?.trim() ||
  "postgres://postgres:postgres@127.0.0.1:5433/postgres";
const CHANNEL = process.env.THUMBS_BROWSER_CHANNEL ?? "chrome";
const SETTLE_MS = Number(process.env.THUMBS_SETTLE_MS ?? 9000);

// Below this a jpeg is a blank/near-blank frame (dark solid ~2-4 KB) — treat
// the capture as failed rather than overwrite a good thumb with an empty one.
const MIN_BYTES = 5_000;

// Ceiling for the grow-to-fit viewport (see the resize at the capture site).
// Viewport height multiplies the page's GPU surface, so an unbounded board would
// OOM the runner; 6000px covers every curated board with room to spare.
const MAX_VIEWPORT_HEIGHT = Number(process.env.THUMBS_MAX_VIEWPORT_H ?? 6000);

// How long to wait for frames to stop rendering their EMPTY state (see the
// data-zf-empty note at the wait site). Generous, because the point is to
// outlast a slow warm-up on a cold CI runner, and it costs nothing on a board
// that is already populated — the wait resolves the moment the last one fills.
const EMPTY_WAIT_MS = Number(process.env.THUMBS_EMPTY_WAIT_MS ?? 45_000);

// A capture with this many empty frames is DEGRADED: it will not overwrite an
// existing thumbnail, because a good picture of yesterday beats a bad picture of
// today. MIN_BYTES already refuses a fully blank shot; this refuses a
// half-loaded one, which is well over the byte floor and is what actually
// shipped ("no fix history yet" across a board that renders fine on a real
// visit).
const MAX_EMPTY_FRAMES = Number(process.env.THUMBS_MAX_EMPTY ?? 1);

// …but never let a thumbnail rot. If a board has a permanently empty frame (a
// retired provider, a market with no prints) the gate above would freeze its
// image forever, so a stale-enough thumb is replaced regardless and the run says
// so. Staleness is the worse failure past this point.
const STALE_THUMB_DAYS = Number(process.env.THUMBS_STALE_DAYS ?? 3);

// Margin of page backdrop kept around the grid in the capture.
const CAPTURE_PAD = 24;

// Extra backdrop below the grid, holding the brand watermark. Real page padding
// (see below) so the clip extends into empty backdrop rather than over a card.
// Shared with the og:image, which must crop this band off its own composite.
const WATERMARK_BAND = CAPTURE_WATERMARK_BAND;

// The official mark, same file the og:image composites (assets/ is inside the
// app so Next's build tracing can reach it; docs/assets is the source of truth).
const MARK_DATA_URI = `data:image/png;base64,${readFileSync(
  join(import.meta.dirname, "..", "assets", "zframes-icon-512.png"),
).toString("base64")}`;

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

  // One query for BOTH kinds now. Curated boards were a static module until
  // 2026-08-05; they are `curated: true` rows in this same table, so this no
  // longer unions a code list with a DB list — the `where` already covers them
  // (curated rows are listed + approved).
  const rows = await sql<{ id: string }[]>`
    select id from dashboards
    where visibility = 'listed' and status = 'approved'
  `.catch(() => []); // no dashboards table yet → nothing to capture
  const targets = rows.map((r) => r.id);

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
  // Captured with empty frames — either kept back, or published because the
  // existing thumb was stale. Reported at the end so a board that quietly
  // degrades every night is visible rather than just looking a bit wrong.
  const degraded: string[] = [];

  for (const id of targets) {
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/dashboard/${id}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForSelector(".zf-frame", { timeout: 45_000 });

      // GROW THE VIEWPORT TO THE WHOLE BOARD BEFORE WAITING FOR DATA.
      //
      // Frames are viewport-gated for battery: `content-visibility` skips
      // rendering off-screen bodies and FrameVisibilityContext pauses `usePolled`
      // for anything not on screen. `fullPage: true` photographs past the
      // viewport, but it does NOT make those frames think they are visible — so
      // on a 3000px board shot through an 810px window, everything below the fold
      // never fetched at all and was captured as an empty card. That is a
      // different failure from the empty-state one above: those frames aren't
      // "empty", they never started.
      //
      // Resizing first makes every frame on-screen, so the gates open and the
      // waits below actually cover the whole board. Capped because the height
      // multiplies GPU memory per page and a runaway board would OOM the runner.
      const fullHeight: number = await page.evaluate(
        () => document.documentElement.scrollHeight,
      );
      await page.setViewportSize({
        width: 1440,
        height: Math.min(Math.max(fullHeight, 810), MAX_VIEWPORT_HEIGHT),
      });

      // Wait for every frame to leave its loading state: data loading renders
      // the shared FrameStatus skeleton (role="status" aria-busy), lazy chunk
      // loads render .zf-frame-skeleton. Soft-fail after 30s — a permanently
      // loading frame (dead provider) shouldn't sink the whole board's thumb,
      // and the MIN_BYTES floor still guards a fully blank shot.
      await page
        .waitForFunction(
          () =>
            !document.querySelector(
              '.zf-grid [aria-busy="true"], .zf-grid .zf-frame-skeleton',
            ),
          { timeout: 30_000 },
        )
        .catch(() =>
          console.warn(
            `  … ${id}: frames still loading after 30s — capturing anyway`,
          ),
        );

      // THEN wait for frames to actually HAVE data, which is a different
      // question from the one above. A frame that resolved with nothing to show
      // is not `aria-busy` — it renders FrameStatus's empty branch and looks
      // finished. Boards whose deepest series warm up lazily (the LBMA London
      // fix history is fire-and-forget behind the spot price) therefore passed
      // the busy check while still empty, and the nightly job published a
      // gold-desk thumbnail reading "no fix history yet" across half its cards.
      //
      // Soft-fail, like the busy wait: some frames are legitimately empty (a
      // dead provider, a market with no data today), and one of those must not
      // stall every capture behind it.
      await page
        .waitForFunction(
          () => !document.querySelector(".zf-grid [data-zf-empty]"),
          { timeout: EMPTY_WAIT_MS },
        )
        .catch(() => {});

      // Then a settle tail: charts draw/animate after data lands (canvas paints
      // aren't observable from the DOM), and live prices tick in over the WS.
      await page.waitForTimeout(SETTLE_MS);

      // Re-read AFTER the settle — the number that matters is what the camera
      // will actually see, not what was true before the tail.
      const emptyTitles: string[] = await page.evaluate(() =>
        [...document.querySelectorAll(".zf-grid [data-zf-empty]")].map(
          (el) =>
            el
              .closest(".zf-frame")
              ?.querySelector(".zf-frame-title")
              ?.textContent?.trim() ||
            el.textContent?.trim().slice(0, 40) ||
            "?",
        ),
      );

      // Hide the page chrome around the board: the sticky site nav would smear
      // into a scroll-stitched shot, and the preview page's title row (main's
      // first child) sits inside the capture margin. visibility (not display)
      // keeps layout geometry so the grid's bounding box is unaffected.
      // The band under the grid is where the brand watermark goes — added as
      // real page padding BEFORE measuring, so scrollHeight grows with it and
      // the clip below can extend into clean backdrop instead of over a card.
      await page.addStyleTag({
        content:
          "header, main > div:first-child { visibility: hidden !important; }" +
          `body { padding-bottom: ${WATERMARK_BAND}px !important; }`,
      });

      // Clip the full-page shot to the grid's box plus a margin of the page's
      // own backdrop, so cards don't sit flush against the image edges (a bare
      // element screenshot clips exactly to .zf-grid, which has no padding).
      const box = await page.locator(".zf-grid").first().boundingBox();
      if (!box) throw new Error("no .zf-grid bounding box");
      const pageSize = await page.evaluate(() => ({
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
      }));

      // Brand the capture itself, bottom-right in the band under the grid, so
      // the screenshot carries the mark wherever it travels (gallery cards, and
      // any reuse of /api/thumbs). Injected into the page rather than composited
      // after the fact: Playwright is already here, so there's no image-encoder
      // dependency and no JPEG re-encode. Right-aligned to the grid's own edge,
      // not the clip's, so it lines up with the cards above it.
      await page.evaluate(
        ({ mark, right, top, band }) => {
          const el = document.createElement("div");
          el.style.cssText = [
            "position:absolute",
            `top:${top}px`,
            `left:${right - 168}px`,
            "width:168px",
            `height:${band}px`,
            "display:flex",
            "align-items:center",
            "justify-content:flex-end",
            "gap:8px",
            "z-index:2147483647",
            "pointer-events:none",
            "opacity:0.92",
          ].join(";");
          // A translucent pill: the backdrop is dark on most boards but a
          // light-mode board (theme.surface) would swallow plain white text.
          const pill = document.createElement("div");
          pill.style.cssText = [
            "display:flex",
            "align-items:center",
            "gap:8px",
            "padding:5px 13px 5px 6px",
            "border-radius:999px",
            "background:rgba(8,8,14,0.58)",
            "border:1px solid rgba(255,255,255,0.12)",
          ].join(";");
          const img = document.createElement("img");
          img.src = mark;
          img.width = 26;
          img.height = 26;
          img.style.cssText = "display:block;border-radius:7px";
          const word = document.createElement("span");
          word.textContent = "zframes";
          word.style.cssText = [
            "color:#ffffff",
            "font-size:15px",
            "font-weight:700",
            "letter-spacing:-0.01em",
            "line-height:1",
            "white-space:nowrap",
          ].join(";");
          pill.append(img, word);
          el.append(pill);
          document.body.append(el);
        },
        {
          mark: MARK_DATA_URI,
          right: box.x + box.width,
          top: box.y + box.height + CAPTURE_PAD,
          band: WATERMARK_BAND,
        },
      );

      const x = Math.max(0, box.x - CAPTURE_PAD);
      const y = Math.max(0, box.y - CAPTURE_PAD);
      const image = await page.screenshot({
        type: "jpeg",
        quality: 80,
        timeout: 30_000,
        fullPage: true, // lets the clip extend past the viewport on tall boards
        clip: {
          x,
          y,
          width: Math.min(box.width + CAPTURE_PAD * 2, pageSize.w - x),
          height: Math.min(
            box.height + CAPTURE_PAD * 2 + WATERMARK_BAND,
            pageSize.h - y,
          ),
        },
      });
      if (image.length < MIN_BYTES)
        throw new Error(`capture too small (${image.length}B)`);

      // THE QUALITY GATE. A half-loaded board is far above MIN_BYTES, so the
      // byte floor never caught it — this does. Refuse to publish over a usable
      // existing thumb, unless that thumb is stale enough that freezing it is
      // the bigger problem.
      if (emptyTitles.length > MAX_EMPTY_FRAMES) {
        const [existing] = await sql`
          select captured_at from dashboard_thumbs where id = ${id}
        `;
        const ageDays = existing
          ? (Date.now() - new Date(existing.captured_at).getTime()) / 86_400_000
          : Infinity;
        if (ageDays < STALE_THUMB_DAYS) {
          degraded.push(id);
          console.warn(
            `  ⚠ ${id}: ${emptyTitles.length} empty frame(s) — KEPT the existing thumb (${ageDays.toFixed(1)}d old): ${emptyTitles.join(", ")}`,
          );
          continue;
        }
        // No thumb at all, or one old enough that stale beats imperfect.
        degraded.push(id);
        console.warn(
          `  ⚠ ${id}: ${emptyTitles.length} empty frame(s) but the existing thumb is ${ageDays === Infinity ? "absent" : `${ageDays.toFixed(1)}d old`} — publishing anyway: ${emptyTitles.join(", ")}`,
        );
      }

      await sql`
        insert into dashboard_thumbs (id, image, content_type, captured_at)
        values (${id}, ${image}, 'image/jpeg', now())
        on conflict (id) do update
          set image = excluded.image,
              content_type = excluded.content_type,
              captured_at = now()
      `;
      ok.push(id);
      console.log(
        `  ✓ ${id} (${Math.round(image.length / 1024)} KB)${emptyTitles.length ? ` · ${emptyTitles.length} empty: ${emptyTitles.join(", ")}` : ""}`,
      );
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
    `done: ${ok.length} captured, ${failed.length} failed, ${degraded.length} degraded, ${pruned.count} pruned`,
  );
  // Named, not just counted. A board that degrades every night is a real
  // regression (a provider that stopped answering) and it would otherwise show
  // up only as a thumbnail nobody looks at closely.
  if (degraded.length > 0) {
    console.warn(
      `degraded (frames still empty at capture time): ${degraded.join(", ")}`,
    );
  }
  if (ok.length === 0) {
    console.error("every capture failed — is the site up and rendering?");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
