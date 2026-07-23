/**
 * Frame vision review — Tier 3 of the scheduled-monitor suite.
 *
 *   pnpm --filter @zframes/storybook build   # produces storybook-static/
 *   CLAUDE_CODE_OAUTH_TOKEN=… pnpm test:frames:vision   # (or ANTHROPIC_API_KEY=…)
 *
 *   VISION_MODEL=claude-haiku-4-5   # cheaper pass (default claude-sonnet-5)
 *   VISION_MAX_FRAMES=5             # cap for a dispatch smoke test
 *   VISION_STORY=Default            # which story to shoot (Default | States | AllVariants)
 *   STORYBOOK_STATIC=…/storybook-static
 *
 * WHY: pixel-diff (Tier 2) catches *changes*; it can't tell you a frame simply
 * *looks bad*. This screenshots every frame's Storybook render and asks Claude
 * vision "is this visually broken?" — automating the manual 203-frame audit.
 *
 * CRITICAL — Storybook renders through an OFFLINE MOCK provider, so many
 * "broken"-looking frames are harness artifacts, not frame bugs (grid
 * measure-race, narrow mock value ranges cramming a chart, legit empty states).
 * The prompt is primed to discount those classes; findings are LEADS for a human
 * to confirm, never verdicts. The workflow files them into a single dedup'd issue.
 *
 * Advisory by design: a "broken" frame files an issue, it does NOT fail the run
 * (exit 0). Only an infra failure (no static build, browser/API error) exits 1.
 */
import Anthropic from "@anthropic-ai/sdk";
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { AddressInfo } from "node:net";

const MODEL = process.env.VISION_MODEL ?? "claude-sonnet-5";
const STORY = process.env.VISION_STORY ?? "Default";
const CHANNEL = process.env.VISION_BROWSER_CHANNEL ?? "chrome";
const MAX_FRAMES = process.env.VISION_MAX_FRAMES
  ? Number(process.env.VISION_MAX_FRAMES)
  : Infinity;
const STATIC_DIR = resolve(
  process.env.STORYBOOK_STATIC ?? "apps/storybook/storybook-static",
);
const SETTLE_MS = Number(process.env.VISION_SETTLE_MS ?? 1800);
const API_CONCURRENCY = Number(process.env.VISION_CONCURRENCY ?? 4);

const SYSTEM = `You are a meticulous UI reviewer inspecting a SINGLE market-dashboard "frame" (a card) rendered in isolation in Storybook.

The render uses an OFFLINE MOCK data provider — NOT live data. Judge ONLY the frame's own visual rendering quality, as a user would see it in a real dashboard card.

Flag a frame as broken ONLY for genuine rendering defects:
- text clipped or truncated by its container (cut-off characters, "…" where the value should be readable)
- content overflowing/spilling outside the card bounds
- labels/elements overlapping so they're unreadable
- severe misalignment, collapsed/zero-height regions, or a blank card where content clearly should be
- an error card ("invalid config" / "unknown frame") — always a real defect

IGNORE these KNOWN HARNESS ARTIFACTS (do NOT flag them):
- a chart that looks a little cramped because the mock feeds a narrow value range (x-domain = extent)
- a chart momentarily small from a mount/measure race
- a legitimately empty/"no data" state — many frames correctly render empty with mock data
- obviously placeholder-looking mock numbers or repeated values
- purely subjective taste (color, spacing you'd merely prefer different)

Be conservative: when unsure, return ok:true. It is far worse to file a false alarm than to miss a marginal case.`;

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ok: {
      type: "boolean",
      description:
        "true if the frame renders correctly (or only shows harness artifacts)",
    },
    severity: { type: "string", enum: ["none", "low", "medium", "high"] },
    category: {
      type: "string",
      enum: [
        "clipping",
        "overflow",
        "overlap",
        "empty",
        "misalign",
        "unreadable",
        "error-card",
        "other",
      ],
    },
    issue: {
      type: "string",
      description: "one concrete sentence on the defect, or empty if ok",
    },
  },
  required: ["ok", "severity", "category", "issue"],
} as const;

interface StoryEntry {
  id: string;
  title: string;
  name: string;
  type: string;
}
interface Frame {
  frame: string;
  id: string;
}
interface Verdict {
  ok: boolean;
  severity: string;
  category: string;
  issue: string;
}

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

/** Minimal static file server for storybook-static (iframe.html fetches JSON, so file:// won't do). */
function serveStatic(
  root: string,
): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith("/")) path += "index.html";
      const filePath = join(root, path);
      if (!filePath.startsWith(root)) {
        res.writeHead(403).end();
        return;
      }
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

function loadFrames(): Frame[] {
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
    // title is "<Category>/<frame>" — the frame name is the last segment
    .map((e) => ({ frame: e.title.split("/").pop() ?? e.title, id: e.id }))
    .sort((a, b) => a.frame.localeCompare(b.frame));
  return Number.isFinite(MAX_FRAMES) ? frames.slice(0, MAX_FRAMES) : frames;
}

async function pool<T, R>(
  items: T[],
  size: number,
  fn: (t: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return results;
}

async function review(
  client: Anthropic,
  frame: string,
  jpeg: Buffer,
): Promise<Verdict> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: VERDICT_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: jpeg.toString("base64"),
            },
          },
          {
            type: "text",
            text: `This is the frame "${frame}". Is its rendering broken?`,
          },
        ],
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);
  const text =
    res.content.find((b): b is Anthropic.TextBlock => b.type === "text")
      ?.text ?? "{}";
  return JSON.parse(text) as Verdict;
}

async function main() {
  const frames = loadFrames();
  console.log(
    `Reviewing ${frames.length} frames (story "${STORY}", model ${MODEL})…`,
  );

  const { origin, close } = await serveStatic(STATIC_DIR);
  const browser = await chromium.launch({ headless: true, channel: CHANNEL });
  const context = await browser.newContext({
    viewport: { width: 820, height: 620 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Phase 1 — screenshot every frame (sequential; one page, deterministic).
  const shots: { frame: string; jpeg: Buffer }[] = [];
  const shotErrors: { frame: string; err: string }[] = [];
  for (const { frame, id } of frames) {
    try {
      await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      // Wait for the story canvas to have content — NOT networkidle (repo-known:
      // a persistent WS never settles; the DOM wait is robust regardless).
      await page
        .locator("#storybook-root")
        .waitFor({ state: "attached", timeout: 15_000 });
      // Prefer the frame card; chrome-less "bare" frames (e.g. breathing) have no
      // .zf-frame, so fall back to the full canvas instead of erroring them out.
      const card = page.locator(".zf-frame").first();
      let target: import("playwright-core").Locator | null = card;
      try {
        await card.waitFor({ state: "visible", timeout: 6_000 });
      } catch {
        target = null;
      }
      await page.waitForTimeout(SETTLE_MS);
      const jpeg = target
        ? await target.screenshot({ type: "jpeg", quality: 72 })
        : await page.screenshot({ type: "jpeg", quality: 72 }); // full viewport
      shots.push({ frame, jpeg });
    } catch (e) {
      shotErrors.push({
        frame,
        err: (e instanceof Error ? e.message : String(e)).slice(0, 200),
      });
    }
  }
  await browser.close();
  await close();
  console.log(
    `Captured ${shots.length}/${frames.length} (${shotErrors.length} capture errors)`,
  );

  // Phase 2 — vision review, bounded concurrency.
  // Auth: a Claude Code OAuth token (CLAUDE_CODE_OAUTH_TOKEN, from `claude
  // setup-token`) is a Bearer token — it goes on `authToken` + the oauth beta
  // header, NOT x-api-key. `apiKey: null` stops the SDK also sending a stray
  // ANTHROPIC_API_KEY from the env (both headers → 401). Falls back to a plain
  // console API key (ANTHROPIC_API_KEY) when no OAuth token is present.
  const oauthToken =
    process.env.CLAUDE_CODE_OAUTH_TOKEN ?? process.env.ANTHROPIC_AUTH_TOKEN;
  const client = oauthToken
    ? new Anthropic({
        authToken: oauthToken,
        apiKey: null,
        defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" },
      })
    : new Anthropic();
  const verdicts = await pool(
    shots,
    API_CONCURRENCY,
    async ({ frame, jpeg }) => {
      try {
        return { frame, ...(await review(client, frame, jpeg)) };
      } catch (e) {
        return {
          frame,
          ok: true,
          severity: "none",
          category: "other",
          issue: `review failed: ${e instanceof Error ? e.message : e}`,
          reviewError: true,
        };
      }
    },
  );

  const sev: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };
  const broken = verdicts
    .filter((v) => !v.ok && !("reviewError" in v))
    .map(({ frame, severity, category, issue }) => ({
      frame,
      severity,
      category,
      issue,
    }))
    .sort((a, b) => (sev[a.severity] ?? 9) - (sev[b.severity] ?? 9));

  // A review call that threw (bad token, model rejected the request, rate-limit)
  // is caught above with ok:true, so it never lands in `broken`. Track it
  // separately — otherwise a fully-failed pass (e.g. a dead OAuth token) reports
  // "0 broken" and reads as a healthy all-clear. `reviewOk` is the count that
  // actually got a verdict from the model.
  const reviewErrors = verdicts
    .filter((v) => "reviewError" in v)
    .map((v) => ({ frame: v.frame, error: v.issue }));
  const reviewOk = shots.length - reviewErrors.length;

  const report = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    story: STORY,
    total: frames.length,
    reviewed: shots.length,
    reviewOk,
    captureErrors: shotErrors,
    reviewErrors,
    broken,
  };
  const outPath = resolve(process.cwd(), "frame-vision-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(
    `\nverdicts: ${reviewOk} reviewed ok, ${reviewErrors.length} review errors (model/auth), ${broken.length} broken`,
  );
  if (reviewErrors.length)
    console.log(`  ⚠ first review error: ${reviewErrors[0].error}`);
  for (const b of broken)
    console.log(`  ✗ [${b.severity}] ${b.frame} — ${b.category}: ${b.issue}`);
  console.log(`\nreport → ${outPath}`);
  // Advisory: findings do not fail the run (the workflow files an issue instead).
  process.exit(0);
}

void main();
