/**
 * Frame size probe — measures, for every frame, how its UI behaves at every grid
 * span the board can give it, so `layout.minW/minH/maxW/maxH` can be derived from
 * evidence rather than guessed.
 *
 * Method: load each frame's Storybook `Default` story (real DashboardRenderer +
 * the deterministic offline mock provider), then RESIZE the single mounted card
 * through the whole w×h envelope by rewriting the two CSS vars the renderer uses
 * for placement (`--zf-col-span` / `--zf-row-span`). Resizing rather than
 * remounting is what makes 96 measurements per frame affordable — and it is also
 * more faithful: charts re-measure through their ResizeObserver exactly as they
 * do when a user drags a resize handle.
 *
 * Per cell it records the objective symptoms of a card that is too small
 * (content clipped by an `overflow:hidden` ancestor, single-line labels hitting
 * their ellipsis, a chart squeezed below legibility, a scroll list showing fewer
 * than a couple of rows) and of one that is too big (the "ink" — the union box of
 * everything that actually paints — covering a shrinking fraction of the card).
 *
 *   pnpm --filter @zframes/storybook build   # produces storybook-static/
 *   pnpm tsx .github/scripts/frame-size-probe.ts
 *
 * Emits frame-size-probe.json. Advisory — never gates a PR.
 */
import { chromium, type Browser, type Page } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { AddressInfo } from "node:net";

const CHANNEL = process.env.PROBE_BROWSER_CHANNEL ?? "chrome";
const MAX_W = Number(process.env.PROBE_MAX_W ?? 12);
const MAX_H = Number(process.env.PROBE_MAX_H ?? 8);
const CONCURRENCY = Number(process.env.PROBE_CONCURRENCY ?? 6);
/** Time for a resize to settle: ResizeObserver → chart redraw → layout. */
const SETTLE_MS = Number(process.env.PROBE_SETTLE_MS ?? 130);
/** Extra settle after the initial mount, before the first measurement. */
const MOUNT_MS = Number(process.env.PROBE_MOUNT_MS ?? 900);
const ONLY = (process.env.PROBE_FRAMES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const OUT = process.env.PROBE_OUT ?? "frame-size-probe.json";
const STATIC_DIR = resolve(
  process.env.STORYBOOK_STATIC ?? "apps/storybook/storybook-static",
);

/** Board geometry the probe measures against — the runtime + Storybook default. */
const ROW = 96;
const GAP = 12;

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

function serveStatic(
  root: string,
): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith("/")) path += "index.html";
      const filePath = join(root, path);
      if (!filePath.startsWith(root)) return void res.writeHead(403).end();
      const fileBody = await readFile(filePath);
      res
        .writeHead(200, {
          "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
        })
        .end(fileBody);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((res) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      res({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

interface StoryEntry {
  id: string;
  title: string;
  name: string;
  type: string;
}

function loadFrames(): { frame: string; id: string }[] {
  const indexPath = join(STATIC_DIR, "index.json");
  if (!existsSync(indexPath))
    throw new Error(
      `no ${indexPath} — run \`pnpm --filter @zframes/storybook build\` first`,
    );
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
    entries: Record<string, StoryEntry>;
  };
  const all = Object.values(index.entries)
    .filter((e) => e.type === "story" && e.name === "Default")
    .map((e) => ({ frame: e.title.split("/").pop() ?? e.title, id: e.id }))
    .sort((a, b) => a.frame.localeCompare(b.frame));
  return ONLY.length ? all.filter((f) => ONLY.includes(f.frame)) : all;
}

export interface Cell {
  w: number;
  h: number;
  /** An error card rendered at this size. */
  err: boolean;
  /** Worst vertical overflow (px) hidden by an `overflow:hidden` ancestor. */
  clipY: number;
  /** Worst horizontal overflow (px) hidden by an `overflow:hidden` ancestor. */
  clipX: number;
  /** Single-line labels actually cut off by their `text-overflow: ellipsis`. */
  ell: number;
  /** Smallest rendered chart box (svg/canvas), px. -1 when the frame has none. */
  chartW: number;
  chartH: number;
  /** Rows visible in the shortest scroll list. -1 when the frame has no list. */
  rows: number;
  /** Fraction of the card's box actually covered by painted content. */
  inkW: number;
  inkH: number;
  /** How many things the frame chose to render — see `inkN` in MEASURE. */
  inkN: number;
  /** The card's own content box, px — useful for reading the ratios above. */
  boxW: number;
  boxH: number;
}

export interface FrameProbe {
  frame: string;
  failed?: string;
  cells: Cell[];
}

/**
 * Runs inside the page. Kept as one string-serialised function (rather than a
 * Playwright helper chain) so the whole measurement happens in a single layout
 * pass — reading `scrollHeight` 400 times over the wire would be both slow and
 * subject to interleaved reflows.
 */
const MEASURE = `(() => {
  const root = document.querySelector('.zf-grid > .zf-frame, .zf-grid > .zf-bare, .zf-grid > .zf-group');
  if (!root) return null;
  const body = root.querySelector(':scope > .zf-frame-body') || root;
  const bodyRect = body.getBoundingClientRect();
  const out = {
    err: !!root.querySelector('.zf-error') || root.classList.contains('zf-frame--error'),
    clipY: 0, clipX: 0, ell: 0,
    chartW: -1, chartH: -1, rows: -1,
    inkW: 0, inkH: 0, inkN: 0,
    boxW: Math.round(bodyRect.width), boxH: Math.round(bodyRect.height),
  };
  let inkL = Infinity, inkR = -Infinity, inkT = Infinity, inkB = -Infinity;
  const noteInk = (r) => {
    if (r.width <= 0 || r.height <= 0) return;
    // inkN counts WHAT the frame rendered, not what fits. A card that reacts to
    // being narrowed by hiding its sparkline, dropping a column, or collapsing a
    // legend clips nothing and overflows nothing — it just quietly shows less,
    // which no geometry check can see. Comparing this count against the same
    // frame at full width is what turns "degrades gracefully" back into a
    // measurable loss. Elements scrolled out of a list still count: the DOM is
    // unchanged there, so a scroller does not read as dropped content.
    out.inkN++;
    if (r.left < inkL) inkL = r.left;
    if (r.right > inkR) inkR = r.right;
    if (r.top < inkT) inkT = r.top;
    if (r.bottom > inkB) inkB = r.bottom;
  };
  const els = [body, ...body.querySelectorAll('*')];
  for (const el of els) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();

    // ── too-small symptom 1: content cut off by a clipping ancestor ──────────
    const ellipsis = cs.textOverflow === 'ellipsis';
    const clips = (v) => v === 'hidden' || v === 'clip';
    if (clips(cs.overflowY)) {
      const over = el.scrollHeight - el.clientHeight;
      if (over > out.clipY) out.clipY = over;
    }
    if (clips(cs.overflowX) && !ellipsis) {
      const over = el.scrollWidth - el.clientWidth;
      if (over > out.clipX) out.clipX = over;
    }
    // ── too-small symptom 2: a label hitting its ellipsis ────────────────────
    if (ellipsis && el.scrollWidth - el.clientWidth > 1) out.ell++;

    // ── too-small symptom 3: a scroll list down to one or two rows ───────────
    const scrolls = (v) => v === 'auto' || v === 'scroll';
    if (scrolls(cs.overflowY) && el.scrollHeight - el.clientHeight > 2) {
      // Descend past single-child wrappers before calling anything a "row". A
      // scroll area whose only child is a <ul>/<div> holding the rows would
      // otherwise report that wrapper's full height as the row height, making
      // every size look like it fits zero rows — the metric reads broken rather
      // than reading small, at every span, which is worse than not having it.
      let list = el;
      for (let guard = 0; guard < 4; guard++) {
        const kids = [...list.children].filter(
          (k) => k.getBoundingClientRect().height > 0,
        );
        if (kids.length !== 1) break;
        list = kids[0];
      }
      const kids = [...list.children].filter(
        (k) => k.getBoundingClientRect().height > 0,
      );
      // Median, not first: a list whose first entry is a sticky header or a
      // taller "featured" row would otherwise set the row height for all of them.
      const heights = kids
        .map((k) => k.getBoundingClientRect().height)
        .sort((a, b) => a - b);
      const rowH = heights.length ? heights[Math.floor(heights.length / 2)] : 0;
      if (rowH > 0) {
        const visible = Math.floor(el.clientHeight / rowH);
        if (out.rows < 0 || visible < out.rows) out.rows = visible;
      }
    }

    // ── too-small symptom 4: a chart squeezed below legibility ───────────────
    const tag = el.tagName.toLowerCase();
    if (tag === 'svg' || tag === 'canvas') {
      // Only the OUTERMOST chart box — a nested <svg> would report its own size.
      if (!el.parentElement || !el.parentElement.closest('svg')) {
        // Icons and sparkline glyphs are not charts; the threshold keeps a 16px
        // status glyph from being read as a collapsed chart.
        if (rect.width >= 40 && rect.height >= 16) {
          // The LARGEST box, not the smallest: a card is judged on its main
          // visualisation, and plenty of them sit a decorative sparkline or a
          // legend swatch beside it. Tracking the smallest made those frames
          // report a chart that never grows, which reads as "this frame has no
          // responsive chart" and quietly switched off the legibility check on
          // exactly the frames that needed it.
          if (rect.width > out.chartW) out.chartW = Math.round(rect.width);
          if (rect.height > out.chartH) out.chartH = Math.round(rect.height);
        }
      }
      noteInk(rect);
      continue;
    }
    if (tag === 'img' || tag === 'video') { noteInk(rect); continue; }

    // ── too-big symptom: how much of the card actually paints ───────────────
    // "Ink" = leaf elements with text, plus media. A stretched flex wrapper is
    // not ink, which is the whole point: it is what makes a 3-line stat card in
    // an 800px box measurable as mostly empty.
    if (el.children.length === 0 && (el.textContent || '').trim().length > 0) noteInk(rect);
    else if (cs.backgroundImage !== 'none' && rect.height > 8) noteInk(rect);
  }
  if (inkR > inkL && bodyRect.width > 0) out.inkW = Math.min(1, (inkR - inkL) / bodyRect.width);
  if (inkB > inkT && bodyRect.height > 0) out.inkH = Math.min(1, (inkB - inkT) / bodyRect.height);
  out.inkW = Math.round(out.inkW * 1000) / 1000;
  out.inkH = Math.round(out.inkH * 1000) / 1000;
  return out;
})()`;

/** Widen the story's wrapper to a full 12-column board and pin the card at 0,0. */
const SETUP = `(() => {
  const grid = document.querySelector('.zf-grid');
  if (!grid) return false;
  const wrapper = grid.parentElement;
  if (wrapper) {
    wrapper.style.width = ${MAX_W * ROW + (MAX_W - 1) * GAP} + 'px';
    wrapper.style.maxWidth = 'none';
  }
  grid.style.setProperty('--zf-cols', '${MAX_W}');
  grid.style.setProperty('--zf-h-rows', '${MAX_H}');
  const card = grid.querySelector(':scope > .zf-frame, :scope > .zf-bare, :scope > .zf-group');
  if (!card) return false;
  card.style.setProperty('--zf-col-start', '1');
  card.style.setProperty('--zf-row-start', '1');
  // content-visibility:auto skips layout for an off-screen body — every probe
  // below reads exactly that layout, so it has to be off here or a tall card
  // measures as empty. Entrance transitions are killed for the same reason: a
  // card measured mid-fade reports a box it is still animating towards.
  const style = document.createElement('style');
  style.textContent = '.zf-frame-body{content-visibility:visible !important;contain-intrinsic-size:auto !important}' +
    '*{animation-duration:0s !important;animation-delay:0s !important;transition-duration:0s !important;transition-delay:0s !important}';
  document.head.appendChild(style);
  window.__zfCard = card;
  return true;
})()`;

async function probeFrame(
  page: Page,
  origin: string,
  frame: string,
  id: string,
): Promise<FrameProbe> {
  const cells: Cell[] = [];
  try {
    await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page
      .locator(
        ".zf-grid > .zf-frame, .zf-grid > .zf-bare, .zf-grid > .zf-group",
      )
      .first()
      .waitFor({ state: "attached", timeout: 20_000 });
    await page.waitForTimeout(MOUNT_MS);
    const ready = await page.evaluate(SETUP);
    if (!ready) return { frame, failed: "no card element", cells };

    for (let h = 1; h <= MAX_H; h++) {
      for (let w = 1; w <= MAX_W; w++) {
        await page.evaluate(
          ([cw, ch]) => {
            const card = (window as unknown as { __zfCard: HTMLElement })
              .__zfCard;
            card.style.setProperty("--zf-col-span", String(cw));
            card.style.setProperty("--zf-row-span", String(ch));
          },
          [w, h],
        );
        await page.waitForTimeout(SETTLE_MS);
        const m = (await page.evaluate(MEASURE)) as Omit<
          Cell,
          "w" | "h"
        > | null;
        if (m) cells.push({ w, h, ...m });
      }
    }
    return { frame, cells };
  } catch (e) {
    return {
      frame,
      failed: (e instanceof Error ? e.message : String(e)).slice(0, 200),
      cells,
    };
  }
}

/**
 * One worker owns its OWN browser and replaces it whenever it dies. Chrome does
 * die here: 96 resize+measure passes over a chart-heavy page, times several
 * workers, is enough to lose a renderer — and a single shared browser turns that
 * into a hang that loses every frame probed so far. A browser per worker, rebuilt
 * on demand, keeps the blast radius at one frame.
 */
async function worker(
  origin: string,
  queue: { frame: string; id: string }[],
  results: FrameProbe[],
  total: number,
  onResult: (probe: FrameProbe) => void,
): Promise<void> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  const fresh = async () => {
    try {
      await browser?.close();
    } catch {
      /* already gone */
    }
    browser = await chromium.launch({ headless: true, channel: CHANNEL });
    const context = await browser.newContext({
      viewport: { width: MAX_W * ROW + (MAX_W - 1) * GAP + 80, height: 1120 },
      deviceScaleFactor: 1,
    });
    page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.on("pageerror", () => {});
  };

  await fresh();
  for (;;) {
    const next = queue.shift();
    if (!next) break;
    let probe = await probeFrame(page!, origin, next.frame, next.id);
    // A crashed browser reports as a failed frame with no cells; rebuild and
    // give the frame exactly one more chance before recording it as failed.
    if (probe.cells.length === 0 && probe.failed) {
      await fresh();
      probe = await probeFrame(page!, origin, next.frame, next.id);
    }
    results.push(probe);
    onResult(probe);
    const note = probe.failed
      ? `FAILED ${probe.failed}`
      : `${probe.cells.length} cells`;
    console.log(`[${results.length}/${total}] ${probe.frame} — ${note}`);
  }
  try {
    await browser?.close();
  } catch {
    /* already gone */
  }
}

async function main() {
  const all = loadFrames();
  // Resume keeps whatever a previous run measured cleanly. Combined with
  // PROBE_FRAMES it becomes a targeted refresh instead: the named frames are
  // re-measured and merged back into the existing matrix, which is what a fix to
  // one of the metrics needs — re-running the whole hour-long sweep to correct a
  // handful of frames is not a trade worth making.
  const done = new Map<string, FrameProbe>();
  if (process.env.PROBE_RESUME && existsSync(OUT)) {
    const prev = JSON.parse(readFileSync(OUT, "utf8")) as {
      results: FrameProbe[];
    };
    const refreshing = new Set(ONLY);
    for (const r of prev.results ?? [])
      if (
        !r.failed &&
        r.cells.length === MAX_W * MAX_H &&
        !refreshing.has(r.frame)
      )
        done.set(r.frame, r);
  }
  const frames = all.filter((f) => !done.has(f.frame));
  console.log(
    `Probing ${frames.length} frames over ${MAX_W}×${MAX_H} spans (${CONCURRENCY} workers)` +
      (done.size ? `, ${done.size} resumed` : "") +
      "…",
  );
  const { origin, close } = await serveStatic(STATIC_DIR);

  const queue = [...frames];
  const results: FrameProbe[] = [...done.values()];
  const flush = () => {
    const sorted = [...results].sort((a, b) => a.frame.localeCompare(b.frame));
    writeFileSync(
      OUT,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          maxW: MAX_W,
          maxH: MAX_H,
          results: sorted,
        },
        null,
        0,
      ),
    );
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () =>
      worker(origin, queue, results, all.length, flush),
    ),
  );

  await close();

  results.sort((a, b) => a.frame.localeCompare(b.frame));
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        maxW: MAX_W,
        maxH: MAX_H,
        results,
      },
      null,
      0,
    ),
  );
  const failed = results.filter((r) => r.failed);
  console.log(`\n${results.length} frames probed, ${failed.length} failed`);
  for (const f of failed) console.log(`  ✗ ${f.frame} — ${f.failed}`);
  console.log(`report → ${OUT}`);
}

void main();
