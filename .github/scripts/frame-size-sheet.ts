/**
 * Frame size contact sheets — one labelled PNG per frame showing it at every
 * CORNER of its declared size envelope, so the bounds derived by measurement can
 * be checked by eye.
 *
 * The probe (`frame-size-probe.ts`) answers "is anything clipped, truncated,
 * missing or squeezed" — questions with a right answer. It cannot answer "does
 * this look good", and the maximum bound is entirely that question: nothing
 * breaks when a card grows, it just stops being worth its space. So the corners
 * get rendered and looked at.
 *
 * Same single-mount resize trick as the probe (rewrite `--zf-col-span` /
 * `--zf-row-span` on the one mounted card), then each size is screenshotted and
 * the tiles are stitched into one sheet by a second page — no image library, and
 * the tiles keep their true pixel sizes so the sheet shows the real aspect
 * ratios rather than a grid of equal boxes.
 *
 *   pnpm --filter @zframes/storybook build
 *   pnpm tsx .github/scripts/frame-size-sheet.ts
 *
 * Writes frame-size-sheets/<frame>.png.
 */
import { chromium, type Browser, type Page } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { AddressInfo } from "node:net";

const CHANNEL = process.env.SHEET_BROWSER_CHANNEL ?? "chrome";
const CONCURRENCY = Number(process.env.SHEET_CONCURRENCY ?? 4);
const SETTLE_MS = Number(process.env.SHEET_SETTLE_MS ?? 700);
const MOUNT_MS = Number(process.env.SHEET_MOUNT_MS ?? 1400);
const OUT_DIR = process.env.SHEET_OUT ?? "frame-size-sheets";
const META_IN = process.env.META_IN ?? "frame-meta.json";
const ONLY = (process.env.SHEET_FRAMES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const STATIC_DIR = resolve(
  process.env.STORYBOOK_STATIC ?? "apps/storybook/storybook-static",
);

const ROW = 96;
const GAP = 12;
const BOARD_COLS = 12;
/** Height ceiling shown for a frame that declares none — the story's own. */
const OPEN_MAX_H = 6;
/**
 * Tiles render at their true pixel size up to this width, and only shrink past
 * it. The sheet exists to answer "is this readable at this size", so a tile
 * scaled uniformly with its neighbours would make the small end of the envelope
 * — the end that actually fails — the hardest part to judge. Each caption
 * carries the real pixel box, so nothing is lost by letting the wide tiles
 * shrink.
 */
const MAX_TILE_W = 780;
/** Sheet page width: two full-size tiles side by side, plus gutters. */
const SHEET_W = 1660;

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

function serveStatic(root: string) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith("/")) path += "index.html";
      const filePath = join(root, path);
      if (!filePath.startsWith(root)) return void res.writeHead(403).end();
      const body = await readFile(filePath);
      res
        .writeHead(200, {
          "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
        })
        .end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise<{ origin: string; close: () => Promise<void> }>((r) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      r({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((d) => server.close(() => d())),
      });
    });
  });
}

interface Layout {
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

/**
 * Two ordinary board spans, always rendered whether or not the envelope allows
 * them. Without these a reviewer can only see INSIDE the bounds, and the most
 * useful correction — "this bound is too tight, the frame is fine at 4×3" — is
 * the one the sheet would be unable to support. They matter most exactly where
 * the envelope has collapsed to a single span and the corner tiles all coincide.
 */
const REFERENCE_SPANS: [number, number][] = [
  [4, 3],
  [8, 5],
];

/**
 * The corners worth looking at. Not the whole cross product: the envelope's
 * interior is never where a frame breaks — its edges are. Deduped, because a
 * frame whose default IS its minimum would otherwise render the same tile twice.
 */
function cornersFor(l: Layout): { w: number; h: number; label: string }[] {
  const minW = Math.max(1, l.minW ?? 1);
  const minH = Math.max(1, l.minH ?? 1);
  const maxW = Math.min(l.maxW ?? BOARD_COLS, BOARD_COLS);
  const maxH = l.maxH ?? Math.max(l.h, OPEN_MAX_H);
  const inside = (w: number, h: number) =>
    w >= minW && w <= maxW && h >= minH && h <= maxH;
  const picks: [number, number, string][] = [
    [minW, minH, "min"],
    [minW, maxH, "narrowest × tallest"],
    [l.w, l.h, "default"],
    [maxW, minH, "widest × shortest"],
    [maxW, maxH, "max"],
    ...REFERENCE_SPANS.map(
      ([w, h]) =>
        [w, h, inside(w, h) ? "reference" : "OUTSIDE bounds"] as [
          number,
          number,
          string,
        ],
    ),
  ];
  const seen = new Set<string>();
  const out: { w: number; h: number; label: string }[] = [];
  for (const [w, h, label] of picks) {
    const key = `${w}x${h}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ w, h, label });
  }
  return out;
}

const SETUP = `(() => {
  const grid = document.querySelector('.zf-grid');
  if (!grid) return false;
  const wrapper = grid.parentElement;
  if (wrapper) { wrapper.style.width = ${
    BOARD_COLS * ROW + (BOARD_COLS - 1) * GAP
  } + 'px'; wrapper.style.maxWidth = 'none'; }
  grid.style.setProperty('--zf-cols', '${BOARD_COLS}');
  grid.style.setProperty('--zf-h-rows', '8');
  const card = grid.querySelector(':scope > .zf-frame, :scope > .zf-bare, :scope > .zf-group');
  if (!card) return false;
  card.style.setProperty('--zf-col-start', '1');
  card.style.setProperty('--zf-row-start', '1');
  const style = document.createElement('style');
  style.textContent = '.zf-frame-body{content-visibility:visible !important;contain-intrinsic-size:auto !important}';
  document.head.appendChild(style);
  window.__zfCard = card;
  return true;
})()`;

interface Tile {
  label: string;
  w: number;
  h: number;
  png: string;
  px: { w: number; h: number };
}

async function tilesFor(
  page: Page,
  origin: string,
  id: string,
  layout: Layout,
): Promise<Tile[]> {
  await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page
    .locator(".zf-grid > .zf-frame, .zf-grid > .zf-bare, .zf-grid > .zf-group")
    .first()
    .waitFor({ state: "attached", timeout: 20_000 });
  await page.waitForTimeout(MOUNT_MS);
  if (!(await page.evaluate(SETUP))) throw new Error("no card element");

  const card = page
    .locator(".zf-grid > .zf-frame, .zf-grid > .zf-bare, .zf-grid > .zf-group")
    .first();
  const tiles: Tile[] = [];
  for (const { w, h, label } of cornersFor(layout)) {
    await page.evaluate(
      ([cw, ch]) => {
        const el = (window as unknown as { __zfCard: HTMLElement }).__zfCard;
        el.style.setProperty("--zf-col-span", String(cw));
        el.style.setProperty("--zf-row-span", String(ch));
      },
      [w, h],
    );
    await page.waitForTimeout(SETTLE_MS);
    const box = await card.boundingBox();
    const shot = await card.screenshot({ type: "png" });
    tiles.push({
      label,
      w,
      h,
      png: shot.toString("base64"),
      px: {
        w: Math.round(box?.width ?? 0),
        h: Math.round(box?.height ?? 0),
      },
    });
  }
  return tiles;
}

/**
 * Stitch by rendering the tiles as one page and screenshotting THAT. Keeps the
 * script dependency-free and, more usefully, lets the sheet carry its own
 * labels — a bare grid of cards says nothing about which span each one is.
 */
async function stitch(
  page: Page,
  frame: string,
  layout: Layout,
  tiles: Tile[],
): Promise<Buffer> {
  const envelope =
    `min ${layout.minW ?? 1}×${layout.minH ?? 1} · default ${layout.w}×${
      layout.h
    } · ` + `max ${layout.maxW ?? "—"}×${layout.maxH ?? "—"}`;
  const body = tiles
    .map(
      (t) => `<figure style="margin:0">
        <figcaption>${t.label} — <b>${t.w}×${t.h}</b> <span class="px">${
          t.px.w
        }×${t.px.h}px</span></figcaption>
        <img src="data:image/png;base64,${t.png}" style="width:${Math.min(
          t.px.w,
          MAX_TILE_W,
        )}px">
      </figure>`,
    )
    .join("");
  await page.setViewportSize({ width: SHEET_W, height: 900 });
  await page.setContent(
    `<html><body style="margin:0;background:#0b0c12;font:12px/1.4 ui-sans-serif,system-ui;color:#cfd2e1">
      <div style="padding:14px 16px">
        <div style="font-size:15px;font-weight:700;color:#fff">${frame}</div>
        <div style="color:#8e93aa;margin-top:2px">${envelope}</div>
        <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-top:12px">${body}</div>
      </div>
      <style>figcaption{color:#9aa0b8;margin-bottom:4px}b{color:#e8eaf4}.px{color:#6a7089}</style>
    </body></html>`,
    { waitUntil: "load" },
  );
  return page.screenshot({ fullPage: true, type: "png" });
}

async function main() {
  const indexPath = join(STATIC_DIR, "index.json");
  if (!existsSync(indexPath))
    throw new Error(`no ${indexPath} — build Storybook first`);
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
    entries: Record<
      string,
      { id: string; title: string; name: string; type: string }
    >;
  };
  const metas = JSON.parse(readFileSync(META_IN, "utf8")) as Record<
    string,
    { layout: Layout | null }
  >;
  let frames = Object.values(index.entries)
    .filter((e) => e.type === "story" && e.name === "Default")
    .map((e) => ({ frame: e.title.split("/").pop() ?? e.title, id: e.id }))
    .sort((a, b) => a.frame.localeCompare(b.frame));
  if (ONLY.length) frames = frames.filter((f) => ONLY.includes(f.frame));

  mkdirSync(OUT_DIR, { recursive: true });
  const { origin, close } = await serveStatic(STATIC_DIR);
  const queue = [...frames];
  let done = 0;
  const failures: string[] = [];

  const worker = async () => {
    let browser: Browser | null = null;
    let page: Page | null = null;
    let sheetPage: Page | null = null;
    const fresh = async () => {
      try {
        await browser?.close();
      } catch {
        /* already gone */
      }
      browser = await chromium.launch({ headless: true, channel: CHANNEL });
      const ctx = await browser.newContext({
        viewport: {
          width: BOARD_COLS * ROW + (BOARD_COLS - 1) * GAP + 80,
          height: 1120,
        },
        deviceScaleFactor: 1,
      });
      page = await ctx.newPage();
      page.setDefaultTimeout(30_000);
      page.on("pageerror", () => {});
      sheetPage = await ctx.newPage();
    };
    await fresh();
    for (;;) {
      const next = queue.shift();
      if (!next) break;
      const layout = metas[next.frame]?.layout ?? { w: 4, h: 3 };
      try {
        const tiles = await tilesFor(page!, origin, next.id, layout);
        const png = await stitch(sheetPage!, next.frame, layout, tiles);
        writeFileSync(join(OUT_DIR, `${next.frame}.png`), png);
      } catch (e) {
        failures.push(
          `${next.frame}: ${(e instanceof Error ? e.message : String(e)).slice(
            0,
            120,
          )}`,
        );
        await fresh();
      }
      done++;
      if (done % 10 === 0) console.log(`[${done}/${frames.length}]`);
    }
    try {
      await browser?.close();
    } catch {
      /* already gone */
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
  );
  await close();
  console.log(`\n${done} sheets → ${OUT_DIR}/  (${failures.length} failed)`);
  for (const f of failures) console.log(`  ✗ ${f}`);
}

void main();
