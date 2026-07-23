#!/usr/bin/env node
/**
 * Published-CLI smoke — the only artifact users install is `npx zframes`, and
 * publishing here is manual and has shipped broken/stale before (missing prebuilt
 * runtime bundle, buggy frames). Nothing else guards it. This drives the REAL
 * published package end to end: init → lint → serve → HTTP-fetch the served app,
 * the dashboard spec, AND the referenced JS bundle (catches a missing/stale
 * prebuilt bundle). Emits a generic monitor report for report-to-issue.mjs.
 *
 * Assumes `zframes` is on PATH (workflow does `npm i -g zframes@latest` first).
 * Plain node — no repo build needed; it tests the registry artifact, not our src.
 *
 *   ZFRAMES_BIN=zframes CLI_SMOKE_PORT=37700 node .github/scripts/cli-smoke.mjs
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = process.env.ZFRAMES_BIN ?? "zframes";
const PORT = Number(process.env.CLI_SMOKE_PORT ?? 37700);
const ORIGIN = `http://127.0.0.1:${PORT}`;

const checks = []; // { name, ok, detail }
const record = (name, ok, detail = "") => checks.push({ name, ok, detail });

function run(args, opts = {}) {
  return execFileSync(BIN, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
    ...opts,
  });
}

async function fetchOk(path, validate) {
  const res = await fetch(`${ORIGIN}${path}`);
  const body = await res.text();
  if (!res.ok) return { ok: false, detail: `${path} → HTTP ${res.status}` };
  return validate
    ? validate(body, res)
    : { ok: true, detail: `${path} → 200 (${body.length}b)` };
}

/** Poll the server until it answers, up to ~30s. */
async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${ORIGIN}/`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

let version = "?";
let serve;
const workdir = mkdtempSync(join(tmpdir(), "zframes-cli-smoke-"));
const spec = join(workdir, "dashboard.json");

try {
  // Version is informational only (the CLI may not expose a version flag) —
  // try a few forms, never count it as a health finding.
  for (const flag of ["--version", "-v", "version"]) {
    try {
      version = run([flag]).trim().split("\n")[0];
      break;
    } catch {
      /* try next */
    }
  }
  // 1. init (path mode → hermetic, no store side effects)
  try {
    run(["init", spec]);
    const parsed = JSON.parse(readFileSync(spec, "utf8"));
    record(
      "init",
      !!parsed.version && Array.isArray(parsed.frames),
      `version=${parsed.version}, frames=${parsed.frames?.length ?? "?"}`,
    );
  } catch (e) {
    record("init", false, String(e.message ?? e).slice(0, 200));
  }

  // 2. lint the freshly-generated spec (exercises the catalogue/validation path)
  try {
    run(["lint", spec]);
    record("lint", true, "clean");
  } catch (e) {
    record("lint", false, String(e.stdout ?? e.message ?? e).slice(0, 200));
  }

  // 3. serve + HTTP smoke
  serve = spawn(BIN, ["serve", spec, "--port", String(PORT)], {
    detached: true,
    stdio: "ignore",
  });
  const up = await waitForServer();
  record(
    "serve boots",
    up,
    up ? `listening on ${PORT}` : "never became reachable",
  );

  if (up) {
    let html = "";
    record(
      "GET / (app html)",
      ...toTuple(
        await fetchOk("/", (b) => {
          html = b;
          const looksHtml = /<script|<div id|<!doctype html/i.test(b);
          return {
            ok: looksHtml && b.length > 200,
            detail: looksHtml ? `200 (${b.length}b)` : "200 but not app HTML",
          };
        }),
      ),
    );
    record(
      "GET /__zframes/dashboard.json",
      ...toTuple(
        await fetchOk("/__zframes/dashboard.json", (b) => {
          try {
            const s = JSON.parse(b);
            return {
              ok: !!s.version && Array.isArray(s.frames),
              detail: `spec ok (v${s.version})`,
            };
          } catch {
            return { ok: false, detail: "not valid JSON" };
          }
        }),
      ),
    );
    // 4. the prebuilt runtime bundle must actually ship — fetch the first script src
    const m = html.match(/<script[^>]+src="([^"]+)"/i);
    if (m) {
      const src = m[1].startsWith("http") ? m[1].replace(ORIGIN, "") : m[1];
      record(
        "GET runtime bundle",
        ...toTuple(
          await fetchOk(src, (b) => ({
            ok: b.length > 1000,
            detail: `${src} → 200 (${b.length}b)`,
          })),
        ),
      );
    } else {
      record("GET runtime bundle", false, "no <script src> found in app HTML");
    }
  }
} finally {
  if (serve?.pid) {
    try {
      process.kill(-serve.pid, "SIGKILL");
    } catch {
      try {
        serve.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }
}

function toTuple(r) {
  return [r.ok, r.detail];
}

const failed = checks.filter((c) => !c.ok);
const findingsCount = failed.length;
const rows = checks
  .map(
    (c) =>
      `| ${c.ok ? "✅" : "❌"} | ${c.name} | ${String(c.detail).replace(/\|/g, "\\|")} |`,
  )
  .join("\n");
const title = `📦 cli-smoke: \`npx zframes@latest\` ${findingsCount ? `failing (${findingsCount})` : "ok"}`;
const body =
  `End-to-end smoke of the **published** \`zframes\` CLI (\`${version}\`): init → lint → serve → HTTP-fetch the app, spec, and runtime bundle.\n\n` +
  `| | check | detail |\n|---|---|---|\n${rows}\n\n_Run: ${new Date().toISOString()}._`;

writeFileSync(
  "cli-smoke-report.json",
  JSON.stringify(
    { generatedAt: new Date().toISOString(), title, body, findingsCount },
    null,
    2,
  ),
);
console.log(
  checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`).join("\n"),
);
console.log(`\n${findingsCount} failing check(s) → cli-smoke-report.json`);
process.exit(0);
