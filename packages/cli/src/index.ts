#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { catalogueForAI } from "@zframes/core/catalogue";
import { DashboardSpecSchema, type DashboardSpec } from "@zframes/core/spec";
import { frameMetas } from "@zframes/frames/schemas";
import { init } from "./init";
import { serve } from "./serve";
import { snapshot } from "./snapshot";

const HELP = `zframes — AI-personalizable market dashboards

usage:
  zframes init [dir|file]     write a bare, valid dashboard.json (envelope only —
                              version, author, grid, background, theme, empty
                              frames) for the agent to fill in; --title <t>,
                              --author <a>, --force to overwrite
  zframes serve [file]        serve <dashboard.json> (default: ./dashboard.json)
                              as a live, editable terminal at 127.0.0.1:37263
                              (--port <n> to change); Save writes back to the file
  zframes catalogue           print the frame catalogue as JSON Schema
                              (this is what a generating agent reads)
  zframes lint <file>         validate a dashboard.json; exit 1 with readable
                              errors (the agent's self-correction feedback)
  zframes snapshot <file>     gather a keyless market snapshot for the symbols
                              on <dashboard.json> + the prior brief, as JSON on
                              stdout (the deterministic half of /zframes-brief)
  zframes help                this text
`;

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
        message: `unknown frame "${instance.frame}". available: ${[
          ...metaByName.keys(),
        ].join(", ")}`,
      });
      continue;
    }

    const parsed = meta.schema.safeParse(instance.config);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          frameId: instance.id,
          message: `config.${issue.path.join(".") || "(root)"}: ${
            issue.message
          }`,
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

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const [command, arg] = args;
  switch (command) {
    case "init":
      return init(args.slice(1));
    case "catalogue":
      console.log(JSON.stringify(catalogueForAI(frameMetas), null, 2));
      return 0;
    case "lint":
      if (!arg) {
        console.error("usage: zframes lint <dashboard.json>");
        return 1;
      }
      return lint(arg);
    case "serve":
      return serve(args.slice(1));
    case "snapshot":
      return snapshot(args.slice(1));
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

main().then((code) => {
  // A bare process.exit() can truncate buffered stdout (the large `catalogue`
  // and `snapshot` JSON) on pipes and redirects — the process dies before the
  // write drains. Flush stdout first, then exit with the code.
  if (process.stdout.write("")) {
    process.exit(code);
  } else {
    process.stdout.once("drain", () => process.exit(code));
  }
});
