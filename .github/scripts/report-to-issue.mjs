#!/usr/bin/env node
/**
 * Turn a scheduled-monitor JSON report into a GitHub issue — the shared glue for
 * every Tier-2+ monitor (provider liveness, frame vision review, …).
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
} else if (kind === "vision") {
  const broken = report.broken ?? [];
  const reviewErrors = report.reviewErrors ?? [];
  const reviewOk = report.reviewOk ?? report.reviewed ?? 0;
  // A pass where NOTHING got a verdict is a broken monitor (dead OAuth token,
  // model rejecting the request), not a clean bill of health — make it a finding
  // so it can't masquerade as "0 broken".
  const passFailed = (report.reviewed ?? 0) > 0 && reviewOk === 0;
  findingsCount = broken.length + (passFailed ? 1 : 0);

  if (passFailed) {
    title = `🖼️ frame-vision: review pass FAILED — 0 frames got a verdict (auth/model?)`;
    body =
      `The vision pass reviewed **0/${report.reviewed}** frames successfully — every model call errored. ` +
      `Likely a rejected \`CLAUDE_CODE_OAUTH_TOKEN\`, a model that can't do vision + structured output, or a rate-limit.\n\n` +
      `First error: \`${reviewErrors[0]?.error ?? "unknown"}\`\n\n_Run: ${report.generatedAt} · model \`${report.model}\`._`;
  } else {
    title = `🖼️ frame-vision: ${broken.length} frame(s) flagged as visually broken`;
    const rows = broken
      .map(
        (b) =>
          `| \`${b.frame}\` | ${b.severity} | ${b.category} | ${String(b.issue).replace(/\|/g, "\\|")} |`,
      )
      .join("\n");
    body =
      `A Claude vision pass over the Storybook \`Default\` render of every frame flagged **${broken.length}** as visually broken ` +
      `(model \`${report.model}\`, ${reviewOk}/${report.total} reviewed ok${reviewErrors.length ? `, ${reviewErrors.length} review errors` : ""}).\n\n` +
      `> ⚠️ Storybook uses an offline mock provider — treat findings as leads, not verdicts. Known false-alarm classes ` +
      `(grid measure-race, extent-domain cramming, no-data States) are filtered in the prompt but some slip through.\n\n` +
      `| frame | severity | category | issue |\n|---|---|---|---|\n${rows || "| — | — | — | — |"}\n\n` +
      `_Run: ${report.generatedAt}._`;
  }
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
