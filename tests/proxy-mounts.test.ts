/**
 * Pins that every in-repo mount of the data relay names the hosts it may reach.
 *
 * `handleProxy` allows NOTHING unless its caller passes `allowHosts`, which is
 * the whole point: zframes ships no decision about which third party a
 * dashboard calls. The failure mode of that design is silent, though. A mount
 * that forgets the option keeps compiling, keeps answering, and refuses every
 * upstream with a 403 the frames render as an empty card, which reads as a
 * frame bug rather than a missing option. There are four mounts today, spread
 * across a CLI server, a Vite plugin, a Storybook config and a Next route, so
 * "grep for it" is exactly the check that gets skipped.
 *
 * Serve's own sources are excluded on purpose: `serve.ts` implements the
 * default and its tests assert that a mount naming nothing reaches nothing.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const ROOTS = ["apps", "packages"];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "storybook-static",
  ".next",
  "coverage",
]);
/**
 * Skipped by PATH, never by directory name. `packages/cli/runtime` is the
 * vendored runtime bundle (it ships a `.mjs` the file filter would otherwise
 * read), but a name-matched "runtime" also silently excluded ALL of
 * `apps/runtime` — the app most likely to grow the next mount, and the one this
 * suite would then never look at.
 */
const SKIP_PATHS = [
  join("packages", "serve"),
  join("packages", "cli", "runtime"),
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out);
    } else if (/\.(ts|tsx|mts|mjs)$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Every `handleProxy(...)` call in a file, as its own source text.
 *
 * Per CALL, not per file: a file-wide substring check passes as soon as
 * `allowHosts` appears anywhere in it, so a second mount added beside a correct
 * one inherits its pass and relays nothing while the suite stays green. Reading
 * the argument list means walking to the matching paren rather than regexing,
 * since three of the four real mounts span several lines.
 */
function proxyCalls(source: string): string[] {
  const calls: string[] = [];
  const opener = /\bhandleProxy\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source))) {
    let depth = 0;
    for (let i = match.index + match[0].length - 1; i < source.length; i += 1) {
      const char = source[i];
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          calls.push(source.slice(match.index, i + 1));
          break;
        }
      }
    }
  }
  return calls;
}

const mounts = ROOTS.flatMap((root) => sourceFiles(join(REPO, root)))
  .map((path) => path.slice(REPO.length))
  .filter((path) => !SKIP_PATHS.some((skip) => path.startsWith(skip)))
  .flatMap((path) =>
    proxyCalls(readFileSync(join(REPO, path), "utf8")).map((call, index) => ({
      // Indexed so a file with two mounts reports which one failed.
      id: `${path}#${index}`,
      call,
    })),
  );

describe("every relay mount names its allowed hosts", () => {
  // If this drops to zero the walk above has rotted and the suite is passing
  // vacuously, which is worse than a failure. Four mounts today: the CLI
  // server, the dev Vite plugin, Storybook's middleware, the explorer route.
  it("finds the mounts at all", () => {
    expect(mounts.length).toBeGreaterThanOrEqual(4);
  });

  it.each(mounts.map(({ id }) => id))("%s passes allowHosts", (id) => {
    const mount = mounts.find((entry) => entry.id === id);
    expect(mount?.call).toContain("allowHosts");
  });
});
