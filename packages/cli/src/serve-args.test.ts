import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  dashboardPath,
  dashboardsDir,
  setDefault,
  storeHome,
} from "@zframes/store/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serve } from "./serve";

// `zframes serve` is the whole product surface of the CLI, yet the one part of
// it that runs before anything is bound — argument parsing, target resolution,
// and the prebuilt-bundle guard — had no test at all. This file pins exactly
// those three refusal tiers, all of which `serve()` reaches BEFORE
// `server.listen`, so nothing here ever binds a port or leaves an unclosable
// server behind:
//
//  * `--port <n>` is the remedy `serve` itself prints on EADDRINUSE ("pass
//    --port <n> or stop the other server"), so a parse regression strands every
//    user who has a port conflict. The nastier variant is a SILENTLY ignored
//    port: the tool then reports 37263 while the user asked for 37270. Each of
//    the three spellings (`--port n`, `--port=n`, `-p n`) is therefore pinned
//    twice — once with a good value (accepted, and the value is consumed by the
//    flag rather than read as the dashboard positional) and once with junk
//    (rejected by the shared range check), which together prove the spelling
//    actually writes the validated `port` slot.
//  * the ORDER of the refusals: a usage mistake (bad port, unknown option)
//    prints the usage line and wins over target resolution, while a missing
//    dashboard prints the store hint and NO usage line. Those two messages are
//    what a lost user gets, and swapping them sends them to the wrong fix.
//  * the runtime-bundle guard — the last defence against a mis-packed npm
//    tarball, and the one post-validation `serve()` path testable with zero
//    scaffolding. The exact probe path is asserted, because it must stay in
//    lockstep with where scripts/build-runtime.mjs writes the bundle
//    (packages/cli/runtime/index.html).
//
// `parseArgs` is module-private on purpose, so everything below drives it
// through the single exported entry point, `serve(args): Promise<number>`, and
// reads the return code plus the console.
//
// Two node builtins are mocked, both narrowly and both to keep the suite
// hermetic rather than to fake behaviour under test:
//
//  * `node:fs` — only the `runtime/index.html` probe is forced to report
//    "missing" (every other path falls through to the real fs). Without this
//    the file's result would depend on whether `pnpm build:cli` had been run
//    locally: with a bundle present `serve()` would reach `listen`, bind
//    127.0.0.1:37263 for real, and never resolve its promise (it only resolves
//    on error) — a hang, not a failure.
//  * `node:http` — `createServer` throws if it is ever called, so "returns
//    before listen" is enforced by the harness instead of assumed. If a
//    refactor ever moved a check below the bind, these tests fail loudly.
//
// Isolation copies packages/cli/src/init.test.ts and dashboards.test.ts: a
// throwaway XDG_CONFIG_HOME per test (storeHome reads the env live) plus a
// separate tmp dir standing in for the cwd, which `serve()` reads through
// `process.cwd()` — spied only for the duration of the call.

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: actual,
    existsSync: (p: Parameters<typeof actual.existsSync>[0]) =>
      String(p).replace(/\\/g, "/").endsWith("/runtime/index.html")
        ? false
        : actual.existsSync(p),
  };
});

vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http")>();
  return {
    ...actual,
    default: actual,
    createServer: vi.fn(() => {
      throw new Error(
        "serve() reached createServer — this suite must never bind a port",
      );
    }),
  };
});

const createServerMock = vi.mocked(createServer);

/** The exact usage line every parse failure appends. */
const USAGE =
  "usage: zframes serve [name|dashboard.json] [--port <n>] [--contact <email>]";
/** The exact port-validation message (bounds included — users read them). */
const PORT_ERROR = "--port must be an integer between 1 and 65535";
/** Where `serve()` probes for the vendored runtime — `../runtime` from src/. */
const BUNDLE_DIR = fileURLToPath(new URL("../runtime", import.meta.url));
/** The two-line bundle refusal, verbatim. */
const BUNDLE_MISSING = `✗ runtime bundle missing at ${BUNDLE_DIR}\n  run \`pnpm build:cli\` to build it.`;

let xdg: string;
let cwd: string;
let prevXdg: string | undefined;
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

/** Everything printed to stdout, joined — must stay empty before `listen`. */
function logged(): string {
  return logSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
}

/** Everything printed to stderr, joined — the refusal messages. */
function errored(): string {
  return errSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
}

/** Store folder layout: dashboards/<name>/dashboard.json. */
function writeDash(name: string, title = name): void {
  mkdirSync(dirname(dashboardPath(name)), { recursive: true });
  writeFileSync(
    dashboardPath(name),
    `${JSON.stringify({ title, frames: [] })}\n`,
  );
}

/** Drive `serve()` with the cwd pinned at the throwaway tmp dir. */
async function runServe(args: string[]): Promise<number> {
  const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(cwd);
  try {
    return await serve(args);
  } finally {
    cwdSpy.mockRestore();
  }
}

beforeEach(() => {
  xdg = mkdtempSync(join(tmpdir(), "zframes-serve-xdg-"));
  cwd = mkdtempSync(join(tmpdir(), "zframes-serve-cwd-"));
  prevXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = xdg;
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  createServerMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXdg;
  rmSync(xdg, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("serve — the harness guarantees the rest of this file rests on", () => {
  it("stubs the bundle probe and the bind, so listen is unreachable", async () => {
    // Proof the `node:fs` stub is live rather than merely redundant: a REAL
    // file whose path ends in `runtime/index.html` reports missing, while its
    // directory reports present. That is what pins every case below to the
    // bundle-guard branch whether or not `pnpm build:cli` has been run in this
    // checkout — otherwise a local build would send serve() into `listen`,
    // binding 127.0.0.1:37263 and never resolving (it only resolves on error).
    const fake = join(cwd, "runtime");
    mkdirSync(fake, { recursive: true });
    writeFileSync(join(fake, "index.html"), "<!doctype html>\n");
    expect(existsSync(fake)).toBe(true);
    expect(existsSync(join(fake, "index.html"))).toBe(false);

    // And proof the `node:http` stub is live: a bind attempt throws instead of
    // opening a socket, so "returns before listen" is enforced, not assumed.
    expect(() => createServer()).toThrow(/must never bind a port/);
    createServerMock.mockClear();
  });
});

describe("serve — the three --port spellings", () => {
  it("accepts each spelling and never reads its value as the dashboard arg", async () => {
    // A store default means a bare `serve` resolves, so getting all the way to
    // the bundle probe is proof the port was accepted. And "37270" appearing in
    // stderr would mean the flag failed to consume it and the number got
    // classified as a store name instead (`no dashboard named "37270"`).
    writeDash("mine");
    setDefault("mine");

    // Control for the `not.toContain("37270")` assertion below: a bare number
    // IS a valid store-name token, so a spelling that failed to consume its
    // value would die here, on a dashboard lookup, instead of at the bundle
    // probe — the exact "port silently ignored" shape.
    expect(await runServe(["37270"])).toBe(1);
    expect(errored()).toContain('✗ no dashboard named "37270" in the store');

    for (const args of [
      ["--port", "37270"],
      ["--port=37270"],
      ["-p", "37270"],
    ]) {
      errSpy.mockClear();
      expect(await runServe(args)).toBe(1);
      expect(errored()).toBe(BUNDLE_MISSING);
      expect(errored()).not.toContain("37270");
    }
    expect(createServerMock).not.toHaveBeenCalled();
  });

  it("routes every spelling into the same validated port slot", async () => {
    // The other half of the pair: if a spelling stopped writing `port`, junk
    // would sail through to the default 37263 and the run would reach the
    // bundle probe instead of being refused here.
    writeDash("mine");
    setDefault("mine");

    for (const args of [["--port", "abc"], ["--port=abc"], ["-p", "abc"]]) {
      errSpy.mockClear();
      expect(await runServe(args)).toBe(1);
      expect(errored()).toBe(`✗ ${PORT_ERROR}\n${USAGE}`);
      expect(errored()).not.toContain("runtime bundle missing");
    }
  });

  it("pins the accepted range at 1–65535 inclusive", async () => {
    writeDash("mine");
    setDefault("mine");

    for (const ok of ["1", "65535", "37263"]) {
      errSpy.mockClear();
      expect(await runServe(["--port", ok])).toBe(1);
      expect(errored()).toBe(BUNDLE_MISSING);
    }
    for (const bad of ["0", "-1", "65536", "99999"]) {
      errSpy.mockClear();
      // "-1" is not even reached as a value — `--port` consumes it verbatim,
      // so this also pins that a negative number is not mistaken for a flag.
      expect(await runServe([`--port=${bad}`])).toBe(1);
      expect(errored()).toBe(`✗ ${PORT_ERROR}\n${USAGE}`);
    }
  });

  it("rejects a non-integer and a value-less trailing flag", async () => {
    writeDash("mine");
    setDefault("mine");

    // `Number.isInteger` is the guard, so a fractional port is refused rather
    // than silently truncated to 8080.
    for (const args of [
      ["--port", "8080.5"],
      ["--port=8080.5"],
      ["--port"], // Number(undefined) → NaN
      ["-p"],
      ["--port="], // Number("") → 0
    ]) {
      errSpy.mockClear();
      expect(await runServe(args)).toBe(1);
      expect(errored()).toBe(`✗ ${PORT_ERROR}\n${USAGE}`);
    }
    expect(createServerMock).not.toHaveBeenCalled();
  });

  it("refuses a bad port before it resolves a target or touches the store", async () => {
    // Empty store, empty cwd: had the port check moved after resolution, this
    // would fail with the "no dashboard found" guidance instead — sending the
    // user off to `zframes init` over a typo in a flag.
    expect(await runServe(["--port", "0"])).toBe(1);
    expect(errored()).toBe(`✗ ${PORT_ERROR}\n${USAGE}`);
    expect(errored()).not.toContain("no dashboard found");
    expect(logged()).toBe("");
    // A refusal is read-only: it must not conjure the store home.
    expect(existsSync(storeHome())).toBe(false);
    expect(createServerMock).not.toHaveBeenCalled();
  });
});

describe("serve — unknown options", () => {
  it("names the offending option and prints the usage line", async () => {
    for (const bad of ["-x", "--nope"]) {
      errSpy.mockClear();
      expect(await runServe([bad])).toBe(1);
      expect(errored()).toBe(`✗ unknown option "${bad}"\n${USAGE}`);
      expect(logged()).toBe("");
    }
    expect(existsSync(storeHome())).toBe(false);
  });

  it("refuses the glued short form rather than ignoring it", async () => {
    // `-p37270` is not a supported spelling. What matters is that it fails
    // LOUDLY (naming the option, with the usage line showing the three real
    // spellings) instead of silently falling back to the default port.
    writeDash("mine");
    setDefault("mine");
    expect(await runServe(["-p37270"])).toBe(1);
    expect(errored()).toBe(`✗ unknown option "-p37270"\n${USAGE}`);
    expect(errored()).not.toContain("runtime bundle missing");
  });

  it("still refuses an unknown option that trails valid arguments", async () => {
    writeDash("mine");
    for (const args of [
      ["mine", "-x"],
      ["--port", "37270", "-x"],
      ["--contact", "ops@example.com", "-x"],
    ]) {
      errSpy.mockClear();
      expect(await runServe(args)).toBe(1);
      expect(errored()).toBe(`✗ unknown option "-x"\n${USAGE}`);
    }
  });
});

describe("serve — the positional dashboard argument", () => {
  it("reads a positional that follows a flag value", async () => {
    // Two dashboards and no default: a bare `serve` is ambiguous, so the
    // ambiguity error vs. the bundle probe is a clean discriminator for
    // "was the positional seen?".
    writeDash("mine");
    writeDash("other");

    expect(await runServe(["--port", "37270"])).toBe(1);
    expect(errored()).toContain("no default dashboard set, and 2 in the store");

    for (const args of [
      ["--port", "37270", "mine"],
      ["--port=37270", "mine"],
      ["-p", "37270", "mine"],
      ["--contact", "ops@example.com", "mine"],
      ["mine", "--port", "37270"],
    ]) {
      errSpy.mockClear();
      expect(await runServe(args)).toBe(1);
      expect(errored()).toBe(BUNDLE_MISSING);
    }
    expect(createServerMock).not.toHaveBeenCalled();
  });

  it("lets the last positional win when several are given", async () => {
    writeDash("mine");

    expect(await runServe(["ghost", "mine"])).toBe(1);
    expect(errored()).toBe(BUNDLE_MISSING);

    errSpy.mockClear();
    expect(await runServe(["mine", "ghost"])).toBe(1);
    expect(errored()).toContain('✗ no dashboard named "ghost" in the store');
  });

  it("refuses a missing dashboard with the store hint and NO usage line", async () => {
    // The second refusal tier. Its message must stay distinguishable from a
    // parse failure: this user has the syntax right and the name wrong, so
    // they get `init`/`list`, not the usage line.
    expect(await runServe(["ghost"])).toBe(1);
    expect(errored()).toContain('✗ no dashboard named "ghost" in the store');
    expect(errored()).toContain(dashboardsDir());
    expect(errored()).toContain("`zframes init ghost`");
    expect(errored()).toContain("`zframes list`");
    expect(errored()).not.toContain(USAGE);
    expect(logged()).toBe("");
    expect(createServerMock).not.toHaveBeenCalled();
  });
});

describe("serve — the prebuilt runtime bundle guard", () => {
  it("refuses with the build hint, naming the exact probe path", async () => {
    // The npm tarball ships this bundle next to dist/; if the packer ever drops
    // it, EVERY `npx zframes serve` lands here. The path is asserted verbatim
    // so the probe and scripts/build-runtime.mjs's output dir cannot drift.
    writeDash("mine");
    setDefault("mine");

    expect(await runServe([])).toBe(1);
    expect(errored()).toBe(BUNDLE_MISSING);
    expect(BUNDLE_DIR.replace(/\\/g, "/")).toMatch(/packages\/cli\/runtime$/);
    expect(logged()).toBe("");
    expect(createServerMock).not.toHaveBeenCalled();
  });

  it("guards a path target and a cwd fallback the same way", async () => {
    // The guard sits after target resolution, so it fires for every kind of
    // target: an explicit path, and the bare-invocation cwd ./dashboard.json
    // fallback (no store involved at all).
    const file = join(cwd, "dashboard.json");
    writeFileSync(file, `${JSON.stringify({ title: "Local", frames: [] })}\n`);

    expect(await runServe([file])).toBe(1);
    expect(errored()).toBe(BUNDLE_MISSING);

    errSpy.mockClear();
    expect(await runServe([])).toBe(1);
    expect(errored()).toBe(BUNDLE_MISSING);
    expect(existsSync(storeHome())).toBe(false);
    expect(createServerMock).not.toHaveBeenCalled();

    // Last test in the file: the bind stub is still armed after every
    // afterEach reset, so the "never reaches listen" guarantee above held for
    // every case in between, not just the first.
    expect(() => createServer()).toThrow(/must never bind a port/);
    createServerMock.mockClear();
  });
});
