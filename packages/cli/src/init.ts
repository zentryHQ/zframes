import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DashboardSpecSchema } from "@zframes/core/spec";

interface InitArgs {
  /** Destination — a `.json` file path, or a directory to drop `dashboard.json` in. */
  target: string;
  title: string;
  /** Free-form author credit (package.json-style). "" leaves the field blank. */
  author: string;
  force: boolean;
}

function parseArgs(args: string[]): InitArgs | { error: string } {
  let target = "dashboard.json";
  let title = "my dashboard";
  let author = "";
  let force = false;
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
    } else if (!a.startsWith("-")) {
      target = a;
    } else {
      return { error: `unknown option "${a}"` };
    }
  }
  if (!title.trim()) return { error: "--title cannot be empty" };
  // A bare `.json`-less target is treated as a directory below; a missing
  // target defaults to ./dashboard.json. Both are fine.
  return { target, title, author, force };
}

/** Resolve the destination file: `.json` paths land as-is; anything else is a
 *  directory we drop `dashboard.json` into (mirroring the skill's "pick a dir"). */
function resolveDest(target: string): string {
  const abs = resolve(process.cwd(), target);
  if (abs.toLowerCase().endsWith(".json")) return abs;
  return resolve(abs, "dashboard.json");
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
      projectId: "YrTzGatwjK7EoFpCSfgZ",
      opacity: 1,
    },
    theme: { accentHue: 242, accentSat: 90, baseHue: 233, baseSat: 20 },
    typography: {
      fontFamily: "sans" as const,
      numericStyle: "proportional" as const,
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
      "usage: zframes init [dir|file.json] [--title <t>] [--author <a>] [--force]",
    );
    return 1;
  }

  const dest = resolveDest(parsed.target);
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
    mkdirSync(dirname(dest), { recursive: true });
    // Same shape the editor's Save/writeback produces: 2-space, trailing newline.
    writeFileSync(dest, `${JSON.stringify(spec, null, 2)}\n`);
  } catch (error) {
    console.error(`✗ could not write ${dest}: ${(error as Error).message}`);
    return 1;
  }

  // Point the follow-up hints at the actual file, even when target was a dir.
  const hint = parsed.target.toLowerCase().endsWith(".json")
    ? parsed.target
    : join(parsed.target, "dashboard.json");
  console.log(`✓ wrote a bare dashboard to ${dest}`);
  console.log("  next: read the catalogue, add frames, then lint + serve:");
  console.log("    npx --yes zframes@latest catalogue");
  console.log(`    npx --yes zframes@latest lint ${hint}`);
  console.log(`    npx --yes zframes@latest serve ${hint}`);
  return 0;
}
