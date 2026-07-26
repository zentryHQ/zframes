import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  configPath,
  dashboardPath,
  dashboardsDir,
  findDashboardFile,
  getDefault,
  resolveServeTarget,
  setDefault,
  storeHome,
} from "@zframes/store/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { list, use } from "./dashboards";

// `zframes list` and `zframes use` are the store's discovery + selection pair,
// and both are load-bearing far beyond their size:
//
//  * every store-aware error message in the CLI ends with "run `zframes list` to
//    see what's there", so `list` is the one command whose output users are
//    pointed at when they're already lost — its exit code must stay 0 on a fresh
//    install (a 1 there reads as a broken install to scripts and to the agent
//    skill), and it must survive a malformed dashboard.json rather than crash;
//  * `use` writes the store default that EVERY bare `zframes serve` follows. If
//    its existence check regresses, `zframes use ghost` succeeds and each later
//    bare serve silently falls through the default to a cwd file or a sole store
//    entry — a wrong dashboard with no error. So every failure path below asserts
//    that config.json was not written and the previous default is intact, not
//    merely that the exit code was 1.
//
// The file also pins the live asymmetry between the two: `list` (and
// `serve <name>`) resolve a dashboard through `findDashboardFile`, which falls
// back to the pre-folder flat `dashboards/<name>.json`, while `use` existence-
// checks the folder path only — see the KNOWN BUG case at the bottom.
//
// Isolation copies packages/cli/src/init.test.ts and packages/store/src/
// store.test.ts: a throwaway XDG_CONFIG_HOME per test (storeHome reads the env
// live) plus a separate tmp dir standing in for the cwd, so neither the real
// store nor the repo is touched. Both functions communicate only through their
// return code and the console, so console.log/error are spied per test.

let xdg: string;
let cwd: string;
let prevXdg: string | undefined;
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

/** Each stdout line, in order — the listing format is asserted verbatim. */
function lines(): string[] {
  return logSpy.mock.calls.map((c: unknown[]) => c.join(" "));
}

/** Everything printed to stdout, joined. */
function logged(): string {
  return lines().join("\n");
}

/** Everything printed to stderr, joined — the failure messages. */
function errored(): string {
  return errSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
}

/** Folder layout: dashboards/<name>/dashboard.json. */
function writeDash(name: string, title = name): void {
  writeDashRaw(name, `${JSON.stringify({ title, frames: [] })}\n`);
}

/** Folder layout, exact bytes — for a titleless or malformed spec. */
function writeDashRaw(name: string, raw: string): void {
  mkdirSync(dirname(dashboardPath(name)), { recursive: true });
  writeFileSync(dashboardPath(name), raw);
}

/** Legacy flat dashboards/<name>.json (the pre-folder layout, still readable). */
function writeFlatDash(name: string, title = name): void {
  mkdirSync(dashboardsDir(), { recursive: true });
  writeFileSync(
    join(dashboardsDir(), `${name}.json`),
    `${JSON.stringify({ title, frames: [] })}\n`,
  );
}

beforeEach(() => {
  xdg = mkdtempSync(join(tmpdir(), "zframes-dash-xdg-"));
  cwd = mkdtempSync(join(tmpdir(), "zframes-dash-cwd-"));
  prevXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = xdg;
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXdg;
  rmSync(xdg, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("list — an empty store", () => {
  it("succeeds (exit 0) with the init hint when nothing exists yet", () => {
    // A fresh install has no store home at all. This is the discovery command
    // the CLI's own errors point at, so "nothing yet" is information, NOT a
    // failure — exit 1 here would make every wrapper script and the agent skill
    // read a brand-new machine as broken.
    expect(list()).toBe(0);
    expect(lines()).toEqual([
      `no dashboards in your store yet (${dashboardsDir()})`,
      "  create one: npx --yes zframes@latest init <name>",
    ]);
    expect(errored()).toBe("");
    // Listing is read-only: it must not conjure the store home.
    expect(existsSync(storeHome())).toBe(false);
  });

  it("treats an existing-but-empty dashboards dir the same way", () => {
    mkdirSync(dashboardsDir(), { recursive: true });
    expect(list()).toBe(0);
    expect(logged()).toContain("no dashboards in your store yet");
    expect(logged()).toContain("init <name>");
  });
});

describe("list — a populated store", () => {
  it("sorts entries, marks only the default with *, and shows titles", () => {
    writeDash("zeta", "Zeta board");
    writeDash("alpha", "Alpha board");
    setDefault("zeta");

    expect(list()).toBe(0);
    expect(lines()).toEqual([
      `dashboards in ${dashboardsDir()}:`,
      "    alpha  — Alpha board",
      "  * zeta  — Zeta board",
      "\n  * = default (served when you run `zframes serve` with no name)",
    ]);
    expect(errored()).toBe("");
  });

  it("falls back to the 'no default set' footer and drops the * legend", () => {
    writeDash("alpha", "Alpha board");
    writeDash("zeta", "Zeta board");

    expect(list()).toBe(0);
    expect(lines()).toEqual([
      `dashboards in ${dashboardsDir()}:`,
      "    alpha  — Alpha board",
      "    zeta  — Zeta board",
      "\n  no default set — `zframes use <name>` to pick one.",
    ]);
    expect(logged()).not.toContain("* = default");
  });

  it("omits the title suffix for a titleless or malformed dashboard", () => {
    // A broken spec must not take the discovery command down with it — the name
    // still has to be listed so the user can `serve`/`lint` it and find out why.
    writeDashRaw("broken", "{ not json at all");
    writeDashRaw("untitled", `${JSON.stringify({ frames: [] })}\n`);

    expect(list()).toBe(0);
    expect(lines()).toEqual([
      `dashboards in ${dashboardsDir()}:`,
      "    broken",
      "    untitled",
      "\n  no default set — `zframes use <name>` to pick one.",
    ]);
    expect(errored()).toBe("");
  });
});

describe("use — refusals leave the store untouched", () => {
  it("prints the usage line when no name is given", () => {
    for (const args of [[], ["--default"], ["-x"]]) {
      errSpy.mockClear();
      expect(use(args)).toBe(1);
      expect(errored()).toBe("usage: zframes use <name>");
      expect(existsSync(configPath())).toBe(false);
      expect(getDefault()).toBeNull();
    }
    expect(existsSync(storeHome())).toBe(false);
  });

  it("rejects a name that isn't a store token, naming it in the error", () => {
    for (const bad of ["Crypto", "../x", "a/b", ".hidden", "a".repeat(65)]) {
      errSpy.mockClear();
      expect(use([bad])).toBe(1);
      expect(errored()).toContain(`✗ "${bad}" is not a valid dashboard name`);
      expect(existsSync(configPath())).toBe(false);
    }
    expect(getDefault()).toBeNull();
    expect(existsSync(storeHome())).toBe(false);
  });

  it("refuses a well-formed but absent name with the init/list hint", () => {
    // The regression that matters: if this existence check ever goes away,
    // `use ghost` returns 0 and every later bare `serve` silently falls through
    // the dangling default instead of hosting what the user asked for.
    expect(use(["ghost"])).toBe(1);
    expect(errored()).toContain(`✗ no dashboard named "ghost" in your store`);
    expect(errored()).toContain(dashboardsDir());
    expect(errored()).toContain("`zframes init ghost`");
    expect(errored()).toContain("`zframes list`");
    expect(logged()).toBe("");
    expect(getDefault()).toBeNull();
    expect(existsSync(configPath())).toBe(false);
  });

  it("does not disturb an already-set default when it refuses", () => {
    writeDash("keep");
    setDefault("keep");
    const before = readFileSync(configPath(), "utf8");

    for (const args of [[], ["Crypto"], ["../keep"], ["ghost"]]) {
      expect(use(args)).toBe(1);
    }

    expect(getDefault()).toBe("keep");
    expect(readFileSync(configPath(), "utf8")).toBe(before);
  });

  it("refuses a name whose folder exists but holds no dashboard.json", () => {
    mkdirSync(join(dashboardsDir(), "hollow"), { recursive: true });
    expect(use(["hollow"])).toBe(1);
    expect(errored()).toContain(`✗ no dashboard named "hollow" in your store`);
    expect(getDefault()).toBeNull();
  });
});

describe("use — setting the default", () => {
  it("points the default at an existing store dashboard", () => {
    writeDash("main", "Main board");

    expect(use(["main"])).toBe(0);
    expect(logged()).toBe('✓ default dashboard is now "main"');
    expect(errored()).toBe("");
    expect(getDefault()).toBe("main");
    // What the write is FOR: a bare `zframes serve` now follows it.
    expect(resolveServeTarget(undefined, cwd)).toEqual({
      kind: "store",
      name: "main",
      file: dashboardPath("main"),
    });
  });

  it("repoints an existing default rather than accumulating keys", () => {
    writeDash("a");
    writeDash("b");

    expect(use(["a"])).toBe(0);
    expect(use(["b"])).toBe(0);
    expect(getDefault()).toBe("b");
    expect(JSON.parse(readFileSync(configPath(), "utf8"))).toEqual({
      default: "b",
    });
  });

  it("also accepts a name that is flagged as the default already", () => {
    writeDash("main");
    setDefault("main");
    logSpy.mockClear();

    expect(use(["main"])).toBe(0);
    expect(getDefault()).toBe("main");
    expect(logged()).toBe('✓ default dashboard is now "main"');
  });

  it("finds the name past flag-shaped arguments", () => {
    writeDash("main");
    expect(use(["--quiet", "main"])).toBe(0);
    expect(getDefault()).toBe("main");
  });

  it("makes the chosen name the one `list` flags", () => {
    writeDash("alpha", "Alpha board");
    writeDash("zeta", "Zeta board");
    expect(use(["zeta"])).toBe(0);
    logSpy.mockClear();

    expect(list()).toBe(0);
    expect(lines()).toContain("  * zeta  — Zeta board");
    expect(lines()).toContain("    alpha  — Alpha board");
  });
});

describe("use vs list — the legacy flat-layout asymmetry", () => {
  it("refuses a legacy flat dashboard that list shows and serve hosts (KNOWN BUG)", () => {
    writeFlatDash("legacy", "Legacy board");
    const flat = join(dashboardsDir(), "legacy.json");

    // `list` surfaces it and `serve legacy` resolves it — both go through
    // findDashboardFile, which falls back to the pre-folder flat layout.
    expect(list()).toBe(0);
    expect(lines()).toContain("    legacy  — Legacy board");
    expect(findDashboardFile("legacy")).toBe(flat);
    expect(resolveServeTarget("legacy", cwd)).toEqual({
      kind: "store",
      name: "legacy",
      file: flat,
    });

    // KNOWN BUG: `use` existence-checks dashboardPath(name) — the folder path
    // only — instead of findDashboardFile(name), so it rejects a legacy flat
    // dashboards/<name>.json as "no dashboard named …", and then tells the user
    // to run `zframes list`, which prints the very name it just refused — should
    // accept the legacy layout wherever existence matters, exactly as `list` and
    // `serve <name>` do. Pinned so the suite stays green; fixing the source must
    // flip this assertion.
    expect(use(["legacy"])).toBe(1);
    expect(errored()).toContain(`✗ no dashboard named "legacy" in your store`);
    expect(getDefault()).toBeNull();

    // And the refusal is not protective: the default it declined to write would
    // have resolved perfectly well for a bare `serve`.
    setDefault("legacy");
    expect(resolveServeTarget(undefined, cwd)).toEqual({
      kind: "store",
      name: "legacy",
      file: flat,
    });
  });

  it("accepts a name once the same dashboard exists in the folder layout", () => {
    // The other half of the asymmetry: nothing about the NAME was wrong, only
    // where the file sat.
    writeFlatDash("legacy", "Legacy board");
    expect(use(["legacy"])).toBe(1);

    writeDash("legacy", "Legacy board");
    expect(use(["legacy"])).toBe(0);
    expect(getDefault()).toBe("legacy");
  });
});
