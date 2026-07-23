#!/usr/bin/env node
/**
 * Dependency security audit — runs `pnpm audit` and emits a generic monitor
 * report (title/body/findingsCount) that report-to-issue.mjs files as an issue.
 * Findings = HIGH + CRITICAL advisories only (moderate/low are noted but don't
 * open an issue — Dependabot handles the steady upgrade stream; this is the
 * "something serious landed" alarm). Exit 0 always — advisory, never blocks.
 *
 *   node .github/scripts/audit-report.mjs   # writes audit-report.json
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// `pnpm audit --json` exits non-zero when it finds anything, so capture stdout
// from the thrown error too.
let raw;
try {
  raw = execFileSync("pnpm", ["audit", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
} catch (e) {
  raw = e.stdout?.toString() ?? "";
}

let audit;
try {
  audit = JSON.parse(raw);
} catch {
  audit = { advisories: {}, metadata: { vulnerabilities: {} } };
}

const counts = audit.metadata?.vulnerabilities ?? {};
const advisories = Object.values(audit.advisories ?? {});
const serious = advisories.filter(
  (a) => a.severity === "high" || a.severity === "critical",
);
const findingsCount = serious.length;

const sevRank = { critical: 0, high: 1 };
const rows = serious
  .sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9))
  .map(
    (a) =>
      `| \`${a.module_name ?? "?"}\` | ${a.severity} | ${String(a.title ?? "").replace(/\|/g, "\\|")} | ${a.url ?? ""} |`,
  )
  .join("\n");

const title = `🔒 security-audit: ${findingsCount} high/critical advisor${findingsCount === 1 ? "y" : "ies"} in dependencies`;
const body =
  `\`pnpm audit\` found **${findingsCount} high/critical** advisor${findingsCount === 1 ? "y" : "ies"}.\n\n` +
  `| package | severity | advisory | link |\n|---|---|---|---|\n${rows || "| — | — | — | — |"}\n\n` +
  `All severities — critical: ${counts.critical ?? 0}, high: ${counts.high ?? 0}, moderate: ${counts.moderate ?? 0}, low: ${counts.low ?? 0}. ` +
  `Moderate/low are left to Dependabot's weekly PRs.\n\n_Run: ${new Date().toISOString()}._`;

writeFileSync(
  "audit-report.json",
  JSON.stringify(
    { generatedAt: new Date().toISOString(), title, body, findingsCount },
    null,
    2,
  ),
);
console.log(
  `${findingsCount} high/critical (crit ${counts.critical ?? 0}, high ${counts.high ?? 0}, mod ${counts.moderate ?? 0}, low ${counts.low ?? 0}) → audit-report.json`,
);
