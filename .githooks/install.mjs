/**
 * Install `.githooks/*` into this repository's real hooks directory.
 *
 * Run by the root package.json `prepare` script, so `pnpm install` installs the
 * hooks on every clone and every machine without a separate setup step.
 *
 * WHY A COPY, NOT A SYMLINK. Hooks live in `--git-common-dir`, which every
 * worktree shares, but `prepare` runs in whichever tree you happened to install
 * from — routinely a worktree under `.claude/worktrees/`. A symlink would then
 * point into that worktree and dangle the moment it is deleted, silently
 * disabling the hook for the whole repository. Copying is immune to that. The
 * cost is that editing `.githooks/*` needs a `pnpm install` (or a bare
 * `node .githooks/install.mjs`) to take effect.
 *
 * It lives here rather than in `scripts/` because the repo's `.gitignore`
 * anchors `/scripts/` as local-only scratch — an installer nobody else receives
 * installs nothing.
 *
 * WHY NOT husky. husky installs itself by setting `core.hooksPath` on the repo,
 * which silently overrides a *global* hooks directory — and this project's
 * authors have one (`~/dotfiles/.config/git/hooks`) whose dispatcher links
 * `.env*` files into newly created worktrees. Taking it over would mean every
 * fresh worktree comes up without env files, with nothing to explain why. That
 * dispatcher already chains to the repo's own hooks and preserves their exit
 * code, so writing into the hooks directory is both sufficient and
 * non-destructive. This script therefore never touches git config.
 */
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Identifies a hook this script wrote, so we never clobber someone's own. */
const MARKER = "managed-by: .githooks/install.mjs";

/** Files in `.githooks/` that are not themselves hooks. */
const NOT_A_HOOK = new Set(["install.mjs"]);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(repoRoot, ".githooks");

if (!existsSync(sourceDir)) process.exit(0);

// CI checks the repo out but never commits from it, and `prepare` runs there too.
if (process.env.CI) process.exit(0);

let hooksDir;
try {
  const commonDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  hooksDir = join(resolve(repoRoot, commonDir), "hooks");
} catch {
  // Not a git repo (a tarball, a vendored copy) — nothing to install.
  process.exit(0);
}

mkdirSync(hooksDir, { recursive: true });

for (const name of readdirSync(sourceDir)) {
  if (NOT_A_HOOK.has(name)) continue;
  const source = join(sourceDir, name);
  const target = join(hooksDir, name);
  const contents = readFileSync(source, "utf8");

  if (!contents.includes(MARKER)) {
    console.warn(
      `install-git-hooks: ${relative(repoRoot, source)} has no "${MARKER}" line — skipping. ` +
        `Add it, or this script cannot tell its own hooks from yours.`,
    );
    continue;
  }

  if (existsSync(target) || isLink(target)) {
    // A stale symlink from an earlier version of this script, or one husky left.
    const existing = isLink(target) ? null : readFileSync(target, "utf8");
    if (existing === contents) continue; // already current
    if (existing !== null && !existing.includes(MARKER)) {
      console.warn(
        `install-git-hooks: ${target} is a hook we did not write — leaving it alone. ` +
          `Merge ${relative(repoRoot, source)} into it by hand if you want both.`,
      );
      continue;
    }
    rmSync(target, { force: true });
  }

  writeFileSync(target, contents);
  chmodSync(target, 0o755);
}

function isLink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
