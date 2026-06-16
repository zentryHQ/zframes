#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogueForAI } from "@zframes/core/catalogue";
import { DashboardSpecSchema, type DashboardSpec } from "@zframes/core/spec";
import { frameMetas } from "@zframes/frames/schemas";

const HELP = `zframes — AI-personalizable market dashboards

usage:
  zframes init [dir]          scaffold a full, runnable dashboard app into <dir>
                              (default: ./my-terminal), refusing a non-empty dir
  zframes init --json [file]  write only a starter dashboard.json (default:
                              ./dashboard.json) — for an existing zframes app
  zframes catalogue           print the frame catalogue as JSON Schema
                              (this is what a generating agent reads)
  zframes lint <file>         validate a dashboard.json; exit 1 with readable
                              errors (the agent's self-correction feedback)
  zframes help                this text
`;

const STARTER: unknown = {
  version: 1,
  title: "my terminal",
  grid: { columns: 12, rowHeight: 96, gap: 12 },
  frames: [
    {
      id: "btc",
      frame: "price-chart",
      position: { x: 0, y: 0, w: 8, h: 3 },
      config: { symbol: "BTC", interval: "1h", mode: "candle" },
    },
    {
      id: "watchlist",
      frame: "price-ticker",
      position: { x: 8, y: 0, w: 4, h: 3 },
      config: { symbols: ["BTC", "ETH", "SOL"] },
    },
  ],
};

interface LintIssue {
  frameId: string | null;
  message: string;
}

/** Validate a parsed spec beyond the Zod pass: frame names, configs, geometry. */
export function lintSpec(spec: DashboardSpec): LintIssue[] {
  const issues: LintIssue[] = [];
  const metaByName = new Map(frameMetas.map((meta) => [meta.name, meta]));

  const seenIds = new Set<string>();
  for (const instance of spec.frames) {
    if (seenIds.has(instance.id))
      issues.push({
        frameId: instance.id,
        message: `duplicate frame id "${instance.id}"`,
      });
    seenIds.add(instance.id);

    const meta = metaByName.get(instance.frame);
    if (!meta) {
      issues.push({
        frameId: instance.id,
        message: `unknown frame "${instance.frame}". available: ${[...metaByName.keys()].join(", ")}`,
      });
      continue;
    }

    const parsed = meta.schema.safeParse(instance.config);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          frameId: instance.id,
          message: `config.${issue.path.join(".") || "(root)"}: ${issue.message}`,
        });
      }
    }

    if (instance.position.x + instance.position.w > spec.grid.columns)
      issues.push({
        frameId: instance.id,
        message: `overflows the grid: x(${instance.position.x}) + w(${instance.position.w}) > ${spec.grid.columns} columns`,
      });
  }

  // Pairwise overlap check — overlapping frames render on top of each other.
  for (let i = 0; i < spec.frames.length; i++) {
    for (let j = i + 1; j < spec.frames.length; j++) {
      const a = spec.frames[i].position;
      const b = spec.frames[j].position;
      const overlap =
        a.x < b.x + b.w &&
        b.x < a.x + a.w &&
        a.y < b.y + b.h &&
        b.y < a.y + a.h;
      if (overlap)
        issues.push({
          frameId: spec.frames[i].id,
          message: `overlaps frame "${spec.frames[j].id}"`,
        });
    }
  }

  return issues;
}

function lint(file: string): number {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    console.error(`✗ cannot read ${file}`);
    return 1;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    console.error(`✗ ${file} is not valid JSON: ${(error as Error).message}`);
    return 1;
  }

  const parsed = DashboardSpecSchema.safeParse(json);
  if (!parsed.success) {
    console.error(`✗ ${file} is not a valid dashboard spec:`);
    for (const issue of parsed.error.issues)
      console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return 1;
  }

  const issues = lintSpec(parsed.data);
  if (issues.length > 0) {
    console.error(`✗ ${file} has ${issues.length} issue(s):`);
    for (const issue of issues)
      console.error(`  [${issue.frameId ?? "spec"}] ${issue.message}`);
    return 1;
  }

  console.log(
    `✓ ${file} is valid — ${parsed.data.frames.length} frame(s) on a ${parsed.data.grid.columns}-column grid`,
  );
  return 0;
}

function initSpec(file: string): number {
  if (existsSync(file)) {
    console.error(`✗ ${file} already exists — refusing to overwrite`);
    return 1;
  }
  writeFileSync(file, `${JSON.stringify(STARTER, null, 2)}\n`);
  console.log(`✓ wrote ${file}`);
  console.log("  next: zframes lint " + file);
  return 0;
}

/** Locate the bundled scaffold template (sibling of both src/ and dist/). */
function templateDir(): string {
  return fileURLToPath(new URL("../templates/app", import.meta.url));
}

/** Scaffold a complete, runnable zframes app (vendored runtime + starter spec). */
function scaffold(target: string): number {
  const tpl = templateDir();
  if (
    !existsSync(join(tpl, "package.json")) ||
    !existsSync(join(tpl, "packages"))
  ) {
    console.error(
      `✗ scaffold template is incomplete at ${tpl}\n` +
        "  the vendored runtime is missing — run `pnpm build:cli` to regenerate it.",
    );
    return 1;
  }

  const dest = resolve(process.cwd(), target);
  if (existsSync(dest)) {
    if (!statSync(dest).isDirectory()) {
      console.error(`✗ ${target} already exists and is not a directory`);
      return 1;
    }
    if (readdirSync(dest).length > 0) {
      console.error(
        `✗ ${target} already exists and is not empty — choose another directory`,
      );
      return 1;
    }
  }

  // Filter is defensive: a pristine template has no node_modules/dist, but if a
  // dev ever installs inside templates/app, never copy those into the scaffold.
  cpSync(tpl, dest, {
    recursive: true,
    filter: (src) => {
      const base = basename(src);
      return base !== "node_modules" && base !== "dist";
    },
  });
  // npm renames/strips .gitignore inside published packages, so the template
  // ships it as _gitignore; restore the real filename on scaffold.
  const ignore = join(dest, "_gitignore");
  if (existsSync(ignore)) renameSync(ignore, join(dest, ".gitignore"));

  console.log(`✓ scaffolded a zframes terminal in ${target}/\n`);
  console.log("  next:");
  console.log(`    cd ${target}`);
  console.log("    pnpm install");
  console.log("    pnpm dev        # http://localhost:5179\n");
  console.log(
    "  then edit src/dashboard.json — by hand, or with the zframes skill.",
  );
  return 0;
}

function main(): number {
  const args = process.argv.slice(2);
  const [command, arg] = args;
  switch (command) {
    case "catalogue":
      console.log(JSON.stringify(catalogueForAI(frameMetas), null, 2));
      return 0;
    case "lint":
      if (!arg) {
        console.error("usage: zframes lint <dashboard.json>");
        return 1;
      }
      return lint(arg);
    case "init": {
      const rest = args.slice(1);
      if (rest[0] === "--json" || rest[0] === "--spec-only") {
        return initSpec(rest[1] ?? "dashboard.json");
      }
      return scaffold(rest[0] ?? "my-terminal");
    }
    case "help":
    case undefined:
      console.log(HELP);
      return 0;
    default:
      console.error(`unknown command "${command}"\n`);
      console.log(HELP);
      return 1;
  }
}

process.exit(main());
