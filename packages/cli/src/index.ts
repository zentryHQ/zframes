#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { DashboardSpecSchema } from "@zframes/spec/spec";
import { classifyTarget } from "@zframes/store/store";
import { catalogue } from "./catalogue";
import { list, use } from "./dashboards";
import { init } from "./init";
import { lintSpec } from "./lint";
import { providers } from "./providers";
import { serve } from "./serve";
import { snapshot } from "./snapshot";

const HELP = `zframes — AI-personalizable market dashboards

A dashboard is one dashboard.json. Point at a file, or name one and it lives in
your global store ($XDG_CONFIG_HOME/zframes, default ~/.config/zframes) so you
can run from anywhere and keep many. A bare token (e.g. \`crypto\`) is a store
name; anything with a "/" or a ".json" suffix is a file path.

usage:
  zframes init [name|dir|file]  write a bare, valid dashboard (envelope only —
                                version, author, grid, background, theme, empty
                                frames) for the agent to fill in. A name lands in
                                the store (and becomes the default if you don't
                                have one yet); --title <t>, --author <a>,
                                --default, --force
  zframes serve [name|file]     serve a dashboard as a live, editable terminal at
                                localhost:37263 (--port <n>). With no arg: the
                                default store dashboard, else ./dashboard.json,
                                else a sole store entry. Save writes back; switch
                                store dashboards from the in-app header dropdown
  zframes list                  list the dashboards in your store (default *)
  zframes use <name>            set the default store dashboard
  zframes providers             list data-provider plugins: installed + available.
                                A bare install renders on built-in DEMO data;
                                \`providers add keyless\` connects the free live
                                market-data fleet (\`add\`/\`remove <id>\` manage
                                the set; adding prints what the plugin contacts
                                and where its terms live)
  zframes catalogue [frame...]  print the frame catalogue + design vocabulary as
                                JSON: frames (config as JSON Schema, sizing),
                                categories, theme presets, background scenes
                                (this is what a generating agent reads). With
                                frame names: full entries for just those frames.
                                --summary: compact browse view — one line per
                                frame plus the presets/scenes with their values
  zframes lint <name|file>      validate a dashboard; exit 1 with readable errors
                                (the agent's self-correction feedback)
  zframes snapshot [name|file]  gather a keyless market snapshot for the symbols
                                on the dashboard + the prior brief, as JSON on
                                stdout (no target → the default store dashboard)
  zframes help                  this text
`;

function lint(arg: string): number {
  const resolved = classifyTarget(arg, process.cwd());
  if ("error" in resolved) {
    console.error(`✗ ${resolved.error}`);
    return 1;
  }
  const file = resolved.file;
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
    case "catalogue": {
      const result = catalogue(args.slice(1));
      if (result.stdout) console.log(result.stdout);
      if (result.stderr) console.error(result.stderr);
      return result.code;
    }
    case "lint":
      if (!arg) {
        console.error("usage: zframes lint <dashboard.json>");
        return 1;
      }
      return lint(arg);
    case "serve":
      return serve(args.slice(1));
    case "list":
    case "ls":
      return list();
    case "use":
      return use(args.slice(1));
    case "providers": {
      const result = providers(args.slice(1));
      if (result.stdout) console.log(result.stdout);
      if (result.stderr) console.error(result.stderr);
      return result.code;
    }
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

main().then(
  (code) => {
    // A bare process.exit() can truncate buffered stdout (the large `catalogue`
    // and `snapshot` JSON) on pipes and redirects — the process dies before the
    // write drains. Flush stdout first, then exit with the code.
    if (process.stdout.write("")) {
      process.exit(code);
    } else {
      process.stdout.once("drain", () => process.exit(code));
    }
  },
  (error: unknown) => {
    // main() shouldn't reject (each command returns a code), but if it does,
    // surface it and exit non-zero instead of an unhandled rejection.
    console.error(error);
    process.exit(1);
  },
);
