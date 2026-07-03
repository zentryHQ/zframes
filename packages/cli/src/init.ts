import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { SCENE_DEFAULT_PROJECT_ID } from "@zframes/spec/presets";
import { DashboardSpecSchema } from "@zframes/spec/spec";
import {
  classifyTarget,
  dashboardsDir,
  ensureHome,
  getDefault,
  setDefault,
} from "@zframes/store/store";

interface InitArgs {
  /**
   * Destination — a bare store *name* (`crypto` → the global store), a `.json`
   * file path, or a directory to drop `dashboard.json` in.
   */
  target: string;
  title: string;
  /** Free-form author credit (package.json-style). "" leaves the field blank. */
  author: string;
  force: boolean;
  /** Make this the default dashboard even if the store already has one. */
  makeDefault: boolean;
}

function parseArgs(args: string[]): InitArgs | { error: string } {
  let target = "dashboard.json";
  let title = "my dashboard";
  let author = "";
  let force = false;
  let makeDefault = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--title" || a === "-t") {
      title = args[++i] ?? "";
    } else if (a.startsWith("--title=")) {
      title = a.slice("--title=".length);
    } else if (a === "--author" || a === "-a") {
      author = args[++i] ?? "";
    } else if (a.startsWith("--author=")) {
      author = a.slice("--author=".length);
    } else if (a === "--force" || a === "-f") {
      force = true;
    } else if (a === "--default") {
      makeDefault = true;
    } else if (!a.startsWith("-")) {
      target = a;
    } else {
      return { error: `unknown option "${a}"` };
    }
  }
  if (!title.trim()) return { error: "--title cannot be empty" };
  // A bare `.json`-less path target is treated as a directory below; a bare
  // name lands in the global store; a missing target defaults to
  // ./dashboard.json. All are fine.
  return { target, title, author, force, makeDefault };
}

/**
 * Resolve where the dashboard is written. A bare name (`crypto`) goes to the
 * global store and carries its `name` so init can set it as the default; a path
 * is honoured verbatim — `.json` lands as-is, anything else is a directory we
 * drop `dashboard.json` into (mirroring the pre-store "pick a dir" behaviour).
 */
function resolveDest(
  target: string,
): { dest: string; name?: string } | { error: string } {
  const c = classifyTarget(target, process.cwd());
  if ("error" in c) return c;
  if (c.kind === "store") return { dest: c.file, name: c.name };
  if (c.file.toLowerCase().endsWith(".json")) return { dest: c.file };
  return { dest: resolve(c.file, "dashboard.json") };
}

/**
 * The bare dashboard envelope, modelled on package.json's header — `version`
 * (semver string) and `author` lead, then the runtime fields. Everything the
 * agent should *not* have to remember or hand-author lives here: the grid
 * geometry, the signature unicorn background, the `theme` colours (accent hue +
 * saturation and the dark card-surface tint), the `typography` (family + numeric
 * style), and the card-surface `appearance` knobs. The `frames` array is
 * intentionally empty: the agent fills it from the
 * user's request (read catalogue → add frames → lint → serve). Built as a
 * literal, then validated through DashboardSpecSchema so a release can never
 * ship a skeleton the runtime would reject.
 */
function skeleton(title: string, author: string) {
  return {
    version: "1.0.0",
    title,
    author,
    grid: { columns: 12, rowHeight: 96, gap: 12 },
    background: {
      type: "unicorn" as const,
      projectId: SCENE_DEFAULT_PROJECT_ID,
      opacity: 1,
    },
    theme: {
      accentHue: 242,
      accentSat: 90,
      baseHue: 233,
      baseSat: 20,
      upColor: "#3fd08f",
      downColor: "#ff6b81",
    },
    typography: {
      fontFamily: "sans" as const,
      numericStyle: "proportional" as const,
      scale: 1,
    },
    appearance: {
      radius: 18,
      borderStrength: 0.22,
      surfaceOpacity: 1,
      density: 1,
      elevation: 1,
    },
    frames: [] as unknown[],
  };
}

export function init(args: string[]): number {
  const parsed = parseArgs(args);
  if ("error" in parsed) {
    console.error(`✗ ${parsed.error}`);
    console.error(
      "usage: zframes init [name|dir|file.json] [--title <t>] [--author <a>] [--default] [--force]",
    );
    return 1;
  }

  const resolved = resolveDest(parsed.target);
  if ("error" in resolved) {
    console.error(`✗ ${resolved.error}`);
    return 1;
  }
  const { dest, name } = resolved;
  if (existsSync(dest)) {
    if (!parsed.force) {
      console.error(`✗ ${dest} already exists`);
      console.error(
        "  edit it directly, or pass --force to overwrite with a bare skeleton.",
      );
      return 1;
    }
    if (!statSync(dest).isFile()) {
      console.error(`✗ ${dest} exists but is not a file`);
      return 1;
    }
  }

  const spec = skeleton(parsed.title, parsed.author);
  // Validate by construction: the literal must satisfy the live schema.
  const check = DashboardSpecSchema.safeParse(spec);
  if (!check.success) {
    console.error("✗ internal error: bare skeleton failed validation");
    for (const issue of check.error.issues)
      console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return 1;
  }

  try {
    // Store targets go through ensureHome so the secret-bearing home is created
    // 0700; then both store and path targets get the dashboard's own dir made —
    // for the store that's its per-name folder (`dashboards/<name>/`), for a path
    // it's the file's parent.
    if (name) ensureHome();
    mkdirSync(dirname(dest), { recursive: true });
    // Same shape the editor's Save/writeback produces: 2-space, trailing newline.
    writeFileSync(dest, `${JSON.stringify(spec, null, 2)}\n`);
  } catch (error) {
    console.error(`✗ could not write ${dest}: ${(error as Error).message}`);
    return 1;
  }

  // A store dashboard becomes the default when asked, or when none is set yet
  // (so the first dashboard makes `zframes serve` with no arg land on it; if the
  // default was never recorded, the next init re-establishes one). No state for
  // path targets.
  let madeDefault = false;
  if (name && (parsed.makeDefault || getDefault() === null)) {
    setDefault(name);
    madeDefault = true;
  }

  // Follow-up hints address the dashboard the way the user will: a store name,
  // or the resolved file path for a path target.
  const hint = name ?? dest;
  console.log(`✓ wrote a bare dashboard to ${dest}`);
  if (name) {
    console.log(
      `  it's in your store (${dashboardsDir()})${madeDefault ? " and is now your default" : ""}.`,
    );
  }
  console.log("  next: read the catalogue, add frames, then lint + serve:");
  console.log("    npx --yes zframes@latest catalogue");
  console.log(`    npx --yes zframes@latest lint ${hint}`);
  console.log(`    npx --yes zframes@latest serve ${hint}`);
  return 0;
}
