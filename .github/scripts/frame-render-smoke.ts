/**
 * Frame render smoke — deterministic, no AI, no credentials. Headless-renders
 * every frame's Storybook `Default` story through the real DashboardRenderer +
 * the offline mock provider, and flags any that render an ERROR CARD (`.zf-error`
 * — shared by unknown-frame / missing-capability / invalid-config / runtime
 * crash) or throw an uncaught page error. Because the mock is deterministic and
 * advertises every capability, an error card in Default = a genuine break.
 *
 * This is the free, reliable half of "is a frame broken?" — it catches frames
 * that CRASH or fail to render, without the AI-vision credential problem. (A
 * pixel-diff for subtle layout regressions is a separate, optional add-on.)
 *
 *   pnpm --filter @zframes/storybook build   # produces storybook-static/
 *   pnpm test:frames:render
 *
 * Emits frame-render-report.json (generic monitor shape). Advisory — exit 0.
 */
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { AddressInfo } from "node:net";

const CHANNEL = process.env.RENDER_BROWSER_CHANNEL ?? "chrome";
const STORY = process.env.RENDER_STORY ?? "Default";
const MAX_FRAMES = process.env.RENDER_MAX_FRAMES
  ? Number(process.env.RENDER_MAX_FRAMES)
  : Infinity;
const SETTLE_MS = Number(process.env.RENDER_SETTLE_MS ?? 1200);
const STATIC_DIR = resolve(
  process.env.STORYBOOK_STATIC ?? "apps/storybook/storybook-static",
);

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
      // Read BEFORE writeHead — inlining `await readFile` into .end() sends the
      // 200 header first, so a missing file then double-sends in the catch.
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

function loadFrames() {
  const indexPath = join(STATIC_DIR, "index.json");
  if (!existsSync(indexPath))
    throw new Error(
      `no ${indexPath} — run \`pnpm --filter @zframes/storybook build\` first`,
    );
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
    entries: Record<string, StoryEntry>;
  };
  const frames = Object.values(index.entries)
    .filter((e) => e.type === "story" && e.name === STORY)
    .map((e) => ({ frame: e.title.split("/").pop() ?? e.title, id: e.id }))
    .sort((a, b) => a.frame.localeCompare(b.frame));
  return Number.isFinite(MAX_FRAMES) ? frames.slice(0, MAX_FRAMES) : frames;
}

async function main() {
  const frames = loadFrames();
  console.log(`Render-smoking ${frames.length} frames (story "${STORY}")…`);

  const { origin, close } = await serveStatic(STATIC_DIR);
  const browser = await chromium.launch({ headless: true, channel: CHANNEL });
  const context = await browser.newContext({
    viewport: { width: 820, height: 620 },
  });
  const page = await context.newPage();

  const broken: { frame: string; reason: string }[] = [];

  for (const { frame, id } of frames) {
    const pageErrors: string[] = [];
    const onErr = (e: Error) => pageErrors.push(e.message);
    page.on("pageerror", onErr);
    try {
      await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      await page
        .locator("#storybook-root")
        .waitFor({ state: "attached", timeout: 15_000 });
      await page.waitForTimeout(SETTLE_MS);
      // Primary signal: the shared error card. Grab its text for the report.
      const errText = await page
        .locator(".zf-error")
        .first()
        .textContent({ timeout: 500 })
        .catch(() => null);
      if (errText !== null) {
        broken.push({
          frame,
          reason: `error card: ${errText.replace(/\s+/g, " ").trim().slice(0, 160)}`,
        });
      } else if (pageErrors.length) {
        broken.push({
          frame,
          reason: `uncaught: ${pageErrors[0].slice(0, 160)}`,
        });
      }
    } catch (e) {
      broken.push({
        frame,
        reason: `render failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`,
      });
    } finally {
      page.off("pageerror", onErr);
    }
  }

  await browser.close();
  await close();

  const findingsCount = broken.length;
  const rows = broken
    .map(
      (b) => `| \`${b.frame}\` | ${String(b.reason).replace(/\|/g, "\\|")} |`,
    )
    .join("\n");
  const title = `🧩 frame-render: ${findingsCount} frame(s) render broken`;
  const body =
    `Headless render of every frame's Storybook \`${STORY}\` story (real renderer + offline mock). ` +
    `**${findingsCount}/${frames.length}** rendered an error card or threw.\n\n` +
    `| frame | reason |\n|---|---|\n${rows || "| — | — |"}\n\n` +
    `_Deterministic — an error card here means unknown-frame, missing-capability, invalid config, or a runtime crash. Run: ${new Date().toISOString()}._`;

  writeFileSync(
    "frame-render-report.json",
    JSON.stringify(
      { generatedAt: new Date().toISOString(), title, body, findingsCount },
      null,
      2,
    ),
  );
  console.log(`\n${findingsCount}/${frames.length} broken:`);
  for (const b of broken) console.log(`  ✗ ${b.frame} — ${b.reason}`);
  console.log(`\nreport → frame-render-report.json`);
  process.exit(0);
}

void main();
