#!/usr/bin/env node
/**
 * Turn a scheduled-monitor JSON report into a GitHub issue — the shared glue for
 * the scheduled monitors (currently the provider-liveness probe).
 *
 *   node .github/scripts/report-to-issue.mjs --kind provider --label provider-drift \
 *        --report provider-smoke-report.json
 *
 * Dedup contract: ONE persistent open issue per `--label`.
 *   • findings this run + an open issue exists  → comment a fresh timeline entry
 *   • findings this run + no open issue          → create the issue
 *   • no findings + an open issue exists         → comment "recovered" + close it
 *   • no findings + no open issue                → do nothing (silent green run)
 *
 * So a flaky free API that dies and recovers produces exactly one issue that
 * opens, accretes a comment per still-failing run, and closes itself when the
 * endpoint comes back — never a new issue per run.
 *
 * Uses the `gh` CLI (auth via GH_TOKEN in Actions). Domain scripts own the data
 * and the pass/fail exit code; this owns only the issue mechanics + rendering.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const kind = arg("kind");
const label = arg("label");
const reportPath = arg("report");
const runUrl =
  process.env.GITHUB_SERVER_URL &&
  process.env.GITHUB_REPOSITORY &&
  process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;

if (!kind || !label || !reportPath) {
  console.error(
    "usage: report-to-issue.mjs --kind <provider|vision> --label <label> --report <path.json>",
  );
  process.exit(2);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));

// ── Render title + body per report kind ─────────────────────────────────────
let findingsCount = 0;
let title = "";
let body = "";

if (kind === "provider") {
  const fails = (report.results ?? []).filter((r) => r.status === "fail");
  const warns = (report.results ?? []).filter((r) => r.status === "warn");
  findingsCount = fails.length;
  title = `🔌 provider-monitor: ${fails.length} keyless provider check(s) failing`;
  const rows = fails
    .map(
      (r) =>
        `| \`${r.provider}\` | \`${r.method}\` | ${r.detail.replace(/\|/g, "\\|")} |`,
    )
    .join("\n");
  body =
    `**${fails.length} provider method(s) threw** against the live API — a dead endpoint, a non-2xx, or a schema change that no longer parses.\n\n` +
    `| provider | method | error |\n|---|---|---|\n${rows || "| — | — | — |"}\n\n` +
    (warns.length
      ? `<details><summary>${warns.length} soft warning(s) (empty/odd shape — not blocking)</summary>\n\n` +
        warns
          .map((r) => `- \`${r.provider}.${r.method}\` — ${r.detail}`)
          .join("\n") +
        `\n</details>\n\n`
      : "") +
    `_Run: ${report.generatedAt} · ${report.ok}/${report.total} ok, ${report.warn} warn, ${report.fail} fail._`;
} else {
  console.error(`unknown --kind ${kind}`);
  process.exit(2);
}

if (runUrl) body += `\n\n[↳ workflow run](${runUrl})`;

// ── gh helpers ───────────────────────────────────────────────────────────────
function gh(args, input) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "inherit"],
  });
}

function findOpenIssue() {
  const json = gh([
    "issue",
    "list",
    "--label",
    label,
    "--state",
    "open",
    "--json",
    "number",
    "--limit",
    "1",
  ]);
  const list = JSON.parse(json || "[]");
  return list.length ? list[0].number : null;
}

// Ensure the label exists (gh errors on create with an unknown label).
try {
  gh([
    "label",
    "create",
    label,
    "--color",
    kind === "provider" ? "B60205" : "5319E7",
    "--description",
    `automated ${kind} monitor`,
    "--force",
  ]);
} catch {
  /* label may already exist / insufficient perms — issue create still works if it exists */
}

const existing = findOpenIssue();

if (findingsCount > 0) {
  if (existing) {
    gh(
      ["issue", "comment", String(existing), "--body-file", "-"],
      `Still failing as of this run.\n\n${body}`,
    );
    console.log(`commented on #${existing} (${findingsCount} findings)`);
  } else {
    const url = gh(
      [
        "issue",
        "create",
        "--title",
        title,
        "--label",
        label,
        "--body-file",
        "-",
      ],
      body,
    ).trim();
    console.log(`opened ${url}`);
  }
} else if (existing) {
  gh(
    ["issue", "comment", String(existing), "--body-file", "-"],
    `✅ Recovered — all checks passed on this run${runUrl ? ` ([run](${runUrl}))` : ""}. Auto-closing.`,
  );
  gh(["issue", "close", String(existing)]);
  console.log(`closed #${existing} (recovered)`);
} else {
  console.log("no findings, no open issue — nothing to do");
}
