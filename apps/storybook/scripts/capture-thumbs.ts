/**
 * Frame thumbnails, captured from the real thing.
 *
 * Photographs each frame's Storybook **Live** story — the one story that runs
 * against the real keyless providers — and writes `<frame>.png` into
 * `packages/frames/widget-icons/`, where the editor palette reads it
 * (`widgetIcon()` in packages/frames/src/schemas.ts).
 *
 *   pnpm --filter @zframes/storybook dev          # must be running (see below)
 *   pnpm --filter @zframes/storybook thumbs --frames breadth-histogram,dominance-bars
 *   pnpm --filter @zframes/storybook thumbs --all
 *
 * DEV SERVER, NOT storybook-static: the Live story needs the same-origin
 * `/__zframes/proxy` route, and that route only exists on the dev server (see
 * .storybook/main.ts). Against a static build, roughly a third of the providers
 * (SEC, Treasury, FRED, FINRA, OFR, BLS, FHFA, metals) render EMPTY — which
 * would be captured as a picture of a broken frame.
 *
 * Flags:
 *   --frames a,b,c   capture only these frames (default: none — pass this or --all)
 *   --all            capture every frame that has a Live story
 *   --out DIR        write here instead of packages/frames/widget-icons
 *   --url URL        Storybook origin (default http://localhost:6006)
 *   --width N        output width in px, aspect preserved (default 192)
 *   --settle MS      extra wait after data lands, for chart draw-in (default 4000)
 *   --concurrency N  pages captured at once (default 3)
 *   --retries N      sequential retry passes over the failures (default 1)
 *   --wait MS        how long a frame gets to load and fill (default 40000)
 *   --report FILE    write a JSON result summary here
 *   --force          overwrite a frame that already has an icon
 *   --keep-empty     write the capture even if the frame reported empty/error
 */
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// scripts → apps/storybook → apps → repo root
const repoRoot = resolve(here, "../../..");
const DEFAULT_OUT = join(repoRoot, "packages/frames/widget-icons");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (name: string) => process.argv.includes(`--${name}`);

const SB = (arg("url") ?? "http://localhost:6006").replace(/\/$/, "");
const OUT = resolve(process.cwd(), arg("out") ?? DEFAULT_OUT);
// The palette shows these at 42-88 px, so 192 is already 2x DPR for the largest
// slot. Captured at 512 first, and 283 of them came to 47 MB for pixels nothing
// ever displays; at 192 the same set is ~4 MB, or ~0.9 MB once quantised below.
const OUT_WIDTH = Number(arg("width") ?? 192);
// The renderer draws charts in over ~1.2s; capturing before that finishes
// photographs a half-drawn line and reads as compressed/wrong data.
const SETTLE_MS = Number(arg("settle") ?? 4000);
const CHANNEL = process.env.THUMBS_BROWSER_CHANNEL ?? "chrome";
// Pages captured at once. Bounded by the keyless upstreams, not by CPU: a wide
// burst just converts into 429s, which arrive as empty frames.
let CONCURRENCY = Number(arg("concurrency") ?? 3);
const RETRIES = Number(arg("retries") ?? 1);
const REPORT = arg("report");
// How long a frame gets to stop loading and to actually have data. Raise it for
// the deep, slow sources (DeFiLlama's per-protocol history, the LBMA fix files).
const WAIT_MS = Number(arg("wait") ?? 40_000);
const WANTED = (arg("frames") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

interface StoryEntry {
  id: string;
  title: string;
  name: string;
  type: string;
}

/**
 * frame name → Live story id, read from Storybook's own index rather than
 * re-deriving its title slugification (`Prices & Markets/dominance-bars` →
 * `prices-markets-dominance-bars--live`), which is not ours to guess.
 */
async function liveStories(): Promise<Map<string, string>> {
  const res = await fetch(`${SB}/index.json`).catch(() => null);
  if (!res?.ok)
    throw new Error(
      `no Storybook at ${SB} — start it with \`pnpm --filter @zframes/storybook dev\``,
    );
  const index = (await res.json()) as { entries: Record<string, StoryEntry> };
  const out = new Map<string, string>();
  for (const e of Object.values(index.entries)) {
    if (e.type !== "story" || e.name !== "Live") continue;
    out.set(e.title.split("/").pop() ?? e.title, e.id);
  }
  return out;
}

/**
 * Downscale a PNG in the browser's own canvas — good resampling, and no image
 * dependency in a repo that has none (playwright-core ships no encoder either).
 * Done on a dedicated blank page so it never touches a story's DOM.
 */
async function downscale(
  page: Page,
  png: Buffer,
  targetWidth: number,
): Promise<Buffer> {
  const dataUri = `data:image/png;base64,${png.toString("base64")}`;
  const out = await page.evaluate(
    async ([src, width]) => {
      const img = new Image();
      img.src = src as string;
      await img.decode();
      const w = Math.min(width as number, img.naturalWidth);
      const h = Math.round((img.naturalHeight * w) / img.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL("image/png").split(",")[1];
    },
    [dataUri, targetWidth] as const,
  );
  return Buffer.from(out, "base64");
}

/**
 * Optional lossy-palette pass. A canvas PNG is 32-bit RGBA (~15 KB at 192 px);
 * quantised to a palette it is ~3 KB with no visible loss at thumbnail size.
 * Deliberately OPTIONAL — `pngquant` is not a repo dependency, and a machine
 * without it must still produce working (merely larger) icons rather than fail.
 */
const HAS_PNGQUANT = (() => {
  try {
    return (
      spawnSync("pngquant", ["--version"], { stdio: "ignore" }).status === 0
    );
  } catch {
    return false;
  }
})();

function quantise(file: string): void {
  if (!HAS_PNGQUANT) return;
  spawnSync(
    "pngquant",
    ["--quality=60-90", "--speed", "1", "--force", "--output", file, file],
    { stdio: "ignore" },
  );
}

interface Result {
  frame: string;
  bytes?: number;
  dims?: string;
  note?: string;
  failed?: string;
}

async function capture(
  context: BrowserContext,
  scaler: Page,
  frame: string,
  storyId: string,
): Promise<Result> {
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  try {
    await page.goto(`${SB}/iframe.html?id=${storyId}&viewMode=story`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    // All three card wrappers. `.zf-frame` is the normal card; a frame whose
    // meta sets `chrome: "bare"` renders `.zf-bare` and no card at all; a
    // `container` frame renders `.zf-group`. Waiting on `.zf-frame` alone times
    // out on every heading/divider/group frame and reads as a dead provider.
    const card = page.locator(".zf-frame, .zf-bare, .zf-group").first();
    await card.waitFor({ state: "visible", timeout: 45_000 });

    let note: string | undefined;

    // 1. Leave the loading state. Data loading renders FrameStatus's skeleton
    //    (role=status aria-busy); a lazy chunk renders .zf-frame-skeleton.
    await page
      .waitForFunction(
        () =>
          !document.querySelector(
            '.zf-grid [aria-busy="true"], .zf-grid .zf-frame-skeleton',
          ),
        { timeout: WAIT_MS },
      )
      .catch(() => (note = `still loading at ${WAIT_MS / 1000}s`));

    // 2. …then actually HAVE data. A frame that resolved with nothing is not
    //    aria-busy — it renders the empty branch and looks finished. Capturing
    //    there produces a thumbnail of the words "no data yet".
    await page
      .waitForFunction(
        () => !document.querySelector(".zf-grid [data-zf-empty]"),
        {
          timeout: WAIT_MS,
        },
      )
      .catch(() => (note = `empty after ${WAIT_MS / 1000}s`));

    // 3. Chart draw-in.
    await page.waitForTimeout(SETTLE_MS);

    const errText = await page
      .locator(".zf-error")
      .first()
      .textContent({ timeout: 300 })
      .catch(() => null);
    if (errText !== null)
      return {
        frame,
        failed: `error card: ${errText.replace(/\s+/g, " ").trim().slice(0, 120)}`,
      };
    if (note && !has("keep-empty")) return { frame, failed: note };
    if (pageErrors.length) note = `uncaught: ${pageErrors[0].slice(0, 80)}`;

    const shot = await card.screenshot({ type: "png" });
    const png = await downscale(scaler, shot, OUT_WIDTH);
    const dims = await scaler.evaluate(
      async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        return `${img.naturalWidth}x${img.naturalHeight}`;
      },
      `data:image/png;base64,${png.toString("base64")}`,
    );
    const file = join(OUT, `${frame}.png`);
    writeFileSync(file, png);
    quantise(file);
    return { frame, bytes: statSync(file).size, dims, note };
  } catch (e) {
    return {
      frame,
      failed: (e instanceof Error ? e.message : String(e)).slice(0, 120),
    };
  } finally {
    await page.close();
  }
}

async function main() {
  const stories = await liveStories();
  const frames = has("all") ? [...stories.keys()].sort() : WANTED;
  if (frames.length === 0) {
    console.error("nothing to do — pass --frames a,b,c or --all");
    process.exit(1);
  }
  const unknown = frames.filter((f) => !stories.has(f));
  if (unknown.length)
    throw new Error(`no Live story for: ${unknown.join(", ")}`);

  mkdirSync(OUT, { recursive: true });
  const todo = has("force")
    ? frames
    : frames.filter((f) => !existsSync(join(OUT, `${f}.png`)));
  const skipped = frames.length - todo.length;
  console.log(
    `capturing ${todo.length} frame(s) from ${SB} → ${OUT}` +
      (skipped ? ` (${skipped} already have an icon; --force to redo)` : ""),
  );

  const browser = await chromium.launch({ headless: true, channel: CHANNEL });
  // ONE context for the whole run, N pages inside it. Pages in a context share
  // an origin's localStorage, which is where the providers' `persist`ed
  // TtlCaches live — so the second frame reading CoinGecko reuses the first
  // frame's response instead of spending another slot of a keyless rate limit.
  // deviceScaleFactor 2 so the downscale has real detail to resample from; a
  // 1x capture scaled down is mush at thumbnail size.
  const context = await browser.newContext({
    viewport: { width: 900, height: 760 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const scaler = await browser.newPage();

  const run = async (list: string[]): Promise<Result[]> => {
    const queue = [...list];
    const out: Result[] = [];
    let done = 0;
    const worker = async () => {
      for (;;) {
        const frame = queue.shift();
        if (!frame) return;
        const r = await capture(context, scaler, frame, stories.get(frame)!);
        out.push(r);
        done += 1;
        console.log(
          `  [${done}/${list.length}] ${frame} ` +
            (r.failed
              ? `✗ ${r.failed}`
              : `✓ ${r.dims}, ${(r.bytes! / 1024).toFixed(1)} KB${r.note ? ` (${r.note})` : ""}`),
        );
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker),
    );
    return out;
  };

  let results = await run(todo);

  // One retry pass, sequential. Most failures here are a keyless provider
  // rate-limiting a burst, not a broken frame — and a serial retry after the
  // burst has drained is what tells the two apart.
  const retryable = results.filter((r) => r.failed).map((r) => r.frame);
  if (retryable.length && RETRIES > 0) {
    console.log(`\nretrying ${retryable.length} failure(s), one at a time…`);
    const byFrame = new Map(results.map((r) => [r.frame, r]));
    for (let i = 0; i < RETRIES; i += 1) {
      const again = [...byFrame.values()]
        .filter((r) => r.failed)
        .map((r) => r.frame);
      if (!again.length) break;
      const prev = CONCURRENCY;
      CONCURRENCY = 1;
      for (const r of await run(again)) byFrame.set(r.frame, r);
      CONCURRENCY = prev;
    }
    results = [...byFrame.values()];
  }

  await browser.close();

  const failed = results.filter((r) => r.failed);
  console.log(`\n${results.length - failed.length}/${results.length} captured`);
  for (const f of failed) console.log(`  ✗ ${f.frame} — ${f.failed}`);
  if (REPORT)
    writeFileSync(
      resolve(process.cwd(), REPORT),
      JSON.stringify({ out: OUT, results }, null, 2),
    );
  process.exit(0);
}

void main();
