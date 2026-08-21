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
  "runtime",
]);
/** Serve owns the default; its tests exercise the empty case deliberately. */
const SKIP_PREFIX = join("packages", "serve");

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

const mounts = ROOTS.flatMap((root) => sourceFiles(join(REPO, root)))
  .filter((path) => !path.slice(REPO.length).startsWith(SKIP_PREFIX))
  .map((path) => ({ path, source: readFileSync(path, "utf8") }))
  .filter(({ source }) => /\bhandleProxy\s*\(/.test(source))
  .map(({ path, source }) => ({ path: path.slice(REPO.length), source }));

describe("every relay mount names its allowed hosts", () => {
  // If this drops to zero the filter above has rotted and the suite is passing
  // vacuously, which is worse than a failure.
  it("finds the mounts at all", () => {
    expect(mounts.length).toBeGreaterThanOrEqual(4);
  });

  it.each(mounts.map(({ path }) => path))("%s passes allowHosts", (path) => {
    const mount = mounts.find((entry) => entry.path === path);
    expect(mount?.source).toContain("allowHosts");
  });
});
