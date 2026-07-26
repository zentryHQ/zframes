import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  classifyTarget,
  configPath,
  credentialsFile,
  dashboardPath,
  dashboardsDir,
  ensureHome,
  getDefault,
  listDashboards,
  setDefault,
  storeHome,
} from "./store";

/**
 * Store-home creation, tilde expansion, and the two tolerance catches — the
 * corners of `./store` that `store.test.ts` (the happy-path resolver suite)
 * leaves open. Four contracts are pinned here:
 *
 *  1. `ensureHome()` — the one export with no coverage, called by `zframes init`
 *     and by `setDefault()`. It creates the home AND the dashboards dir, is
 *     idempotent, and on posix leaves the home `0700`. That mode is the only
 *     thing between other users of a shared machine and `credentials.json`
 *     (which lives in this same home), and widening it has NO functional
 *     symptom — nothing else in the suite would go red.
 *  2. `expandTilde` via `classifyTarget` — `serve ~/dash.json` is named in the
 *     source as an invocation that must stay byte-for-byte back-compatible.
 *     Shells only expand `~` when unquoted, so a config- or script-supplied arg
 *     arrives literal and the store has to expand it itself; the failure mode is
 *     a silent `<cwd>/~/dash.json`.
 *  3. `listDashboards()` tolerance — a `dashboards/<name>/dashboard.json` left
 *     malformed or truncated by a concurrent editor Save must still LIST (with
 *     `title: null`) instead of throwing, or one bad file takes down
 *     `zframes list` and the in-app switcher overlay, hiding every healthy
 *     dashboard.
 *  4. `readConfig`/`getDefault()` tolerance — a corrupt `config.json` degrades
 *     to "no default", never a propagated SyntaxError.
 *
 * Isolation copies `store.test.ts`: a throwaway `XDG_CONFIG_HOME` (read live by
 * `storeHome()`) plus a separate tmp `cwd`, so the real store is never touched.
 */

let xdg: string;
let cwd: string;
let prevXdg: string | undefined;

/** Write raw bytes as a folder dashboard's spec (may be deliberately invalid). */
function writeSpec(name: string, contents: string): void {
  mkdirSync(dirname(dashboardPath(name)), { recursive: true });
  writeFileSync(dashboardPath(name), contents);
}

function writeHealthy(name: string, title = name): void {
  writeSpec(name, `${JSON.stringify({ title, frames: [] })}\n`);
}

/** Write raw bytes as config.json (may be deliberately invalid). */
function writeConfig(contents: string): void {
  mkdirSync(storeHome(), { recursive: true });
  writeFileSync(configPath(), contents);
}

function permBits(p: string): number {
  return statSync(p).mode & 0o777;
}

/** classifyTarget → the resolved file of a PATH-kind result (fails otherwise). */
function pathFileOf(arg: string): string {
  const r = classifyTarget(arg, cwd);
  if ("error" in r) throw new Error(`expected a path, got error: ${r.error}`);
  expect(r.kind).toBe("path");
  return r.file;
}

beforeEach(() => {
  xdg = mkdtempSync(join(tmpdir(), "zframes-xdg-"));
  cwd = mkdtempSync(join(tmpdir(), "zframes-cwd-"));
  prevXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = xdg;
});

afterEach(() => {
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXdg;
  rmSync(xdg, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("ensureHome", () => {
  it("creates the home and the dashboards dir, and nothing else", () => {
    expect(existsSync(storeHome())).toBe(false);

    ensureHome();

    expect(statSync(storeHome()).isDirectory()).toBe(true);
    expect(statSync(dashboardsDir()).isDirectory()).toBe(true);
    // It provisions dirs only — no config, no credentials, so a freshly
    // ensured home still has no default and no secret file.
    expect(existsSync(configPath())).toBe(false);
    expect(existsSync(credentialsFile())).toBe(false);
    expect(getDefault()).toBeNull();
    expect(listDashboards()).toEqual([]);
  });

  it("creates every missing level of a deep XDG_CONFIG_HOME", () => {
    const deep = join(xdg, "nested", "under", "here");
    process.env.XDG_CONFIG_HOME = deep;
    expect(existsSync(deep)).toBe(false);

    ensureHome();

    expect(storeHome()).toBe(join(deep, "zframes"));
    expect(statSync(dashboardsDir()).isDirectory()).toBe(true);
  });

  it("is idempotent and preserves what is already in the store", () => {
    ensureHome();
    writeHealthy("keep", "Keep me");
    setDefault("keep");

    ensureHome();
    ensureHome();

    expect(statSync(storeHome()).isDirectory()).toBe(true);
    expect(getDefault()).toBe("keep");
    expect(listDashboards()).toEqual([
      {
        name: "keep",
        file: dashboardPath("keep"),
        title: "Keep me",
        isDefault: true,
      },
    ]);
  });

  it("re-creates a dashboards dir that went missing under an existing home", () => {
    mkdirSync(storeHome(), { recursive: true });
    expect(existsSync(dashboardsDir())).toBe(false);

    ensureHome();

    expect(statSync(dashboardsDir()).isDirectory()).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "creates the home 0700 because credentials.json lives in it",
    () => {
      ensureHome();

      // The security property, independent of the ambient umask: no group/other
      // access to the dir that holds the plaintext credential file.
      expect(permBits(storeHome()) & 0o077).toBe(0);
      expect(permBits(storeHome())).toBe(0o700);
      // …and that home really is the credential file's parent — `./account`
      // reads its path from this module precisely so the two can't drift apart.
      expect(dirname(credentialsFile())).toBe(storeHome());
      expect(dirname(configPath())).toBe(storeHome());
      // The dashboards subdir is not secret-bearing; it is only required to be
      // owner-traversable (its exact bits follow the umask).
      expect(permBits(dashboardsDir()) & 0o700).toBe(0o700);
    },
  );

  it.skipIf(process.platform === "win32")(
    "does not re-tighten a home that already exists wide open",
    () => {
      mkdirSync(storeHome(), { recursive: true });
      chmodSync(storeHome(), 0o755);

      ensureHome();

      // Documented as "the home is *created* 0700": mkdirSync's `mode` is
      // ignored for an existing dir, so a home left 0755 by an older version
      // stays 0755 here. The compensating control lives in `./account`, whose
      // writeStore() does an explicit chmod(storeHome(), 0o700) before writing
      // the secret. Pinned as-is; adding a chmod here would flip this to 0o700.
      expect(permBits(storeHome())).toBe(0o755);
      expect(statSync(dashboardsDir()).isDirectory()).toBe(true);
    },
  );

  it.skipIf(process.platform === "win32")(
    "setDefault provisions the private home before writing config.json",
    () => {
      // setDefault is the other ensureHome caller: `zframes use <name>` on a
      // machine with no store must not leave a world-readable home behind.
      expect(existsSync(storeHome())).toBe(false);

      setDefault("main");

      expect(permBits(storeHome())).toBe(0o700);
      expect(statSync(dashboardsDir()).isDirectory()).toBe(true);
      expect(getDefault()).toBe("main");
    },
  );
});

describe("classifyTarget — tilde expansion", () => {
  it("expands a leading ~/ against the home dir, not the cwd", () => {
    expect(classifyTarget("~/dash.json", cwd)).toEqual({
      kind: "path",
      file: resolve(homedir(), "dash.json"),
    });
    const file = pathFileOf("~/dash.json");
    // The regression this guards: a literal `~` segment under the cwd.
    expect(file).not.toContain("~");
    expect(file.startsWith(homedir())).toBe(true);
    expect(file).not.toBe(join(cwd, "~", "dash.json"));
  });

  it("expands ~/ for a nested path too", () => {
    expect(pathFileOf("~/boards/crypto/dashboard.json")).toBe(
      resolve(homedir(), "boards", "crypto", "dashboard.json"),
    );
  });

  it("treats a bare ~ as the whole home dir", () => {
    // No `.json` suffix, but the leading `~` is itself a path signal — so this
    // is a directory target the caller appends dashboard.json to, never a name.
    expect(classifyTarget("~", cwd)).toEqual({
      kind: "path",
      file: resolve(homedir()),
    });
  });

  it("leaves ~user untouched (no shell-style user expansion)", () => {
    // POSIX shells expand `~someuser`; node has no equivalent, so expandTilde
    // only handles `~` and `~/…`. The arg still classifies as a path (leading
    // `~`), it just stays cwd-relative rather than resolving to another user.
    expect(pathFileOf("~someuser/dash.json")).toBe(
      join(cwd, "~someuser", "dash.json"),
    );
  });

  it("treats a backslash-bearing arg as a path, not an invalid name", () => {
    // The windows separator is a path signal, so `sub\dash` never reaches the
    // name validator (which would reject it). Resolution itself is
    // platform-specific, so only the classification is pinned.
    const r = classifyTarget("sub\\dash", cwd);
    expect("error" in r).toBe(false);
    expect(r).toMatchObject({ kind: "path" });
  });
});

describe("listDashboards — tolerance to half-written specs", () => {
  it("lists a malformed dashboard.json with a null title, keeping healthy siblings", () => {
    writeHealthy("crypto", "Crypto board");
    // Truncated mid-write, exactly as a concurrent editor Save can leave it.
    writeSpec("broken", '{"title": "Half wri');

    const entries = listDashboards();

    expect(entries.map((e) => e.name)).toEqual(["broken", "crypto"]);
    expect(entries[0]).toEqual({
      name: "broken",
      file: dashboardPath("broken"),
      title: null,
      isDefault: false,
    });
    expect(entries[1].title).toBe("Crypto board");
  });

  it("lists a zero-byte spec with a null title", () => {
    writeSpec("empty", "");
    writeHealthy("ok", "Fine board");

    expect(listDashboards()).toEqual([
      {
        name: "empty",
        file: dashboardPath("empty"),
        title: null,
        isDefault: false,
      },
      {
        name: "ok",
        file: dashboardPath("ok"),
        title: "Fine board",
        isDefault: false,
      },
    ]);
  });

  it("nulls a non-string or absent title rather than leaking it through", () => {
    writeSpec("numeric", JSON.stringify({ title: 42, frames: [] }));
    writeSpec("untitled", JSON.stringify({ frames: [] }));

    const byName = new Map(listDashboards().map((e) => [e.name, e.title]));
    expect([...byName.keys()]).toEqual(["numeric", "untitled"]);
    expect(byName.get("numeric")).toBeNull();
    expect(byName.get("untitled")).toBeNull();
  });

  it("skips folders without a dashboard.json and folders with an invalid name", () => {
    writeHealthy("real", "Real board");
    mkdirSync(join(dashboardsDir(), "no-spec-here"), { recursive: true });
    writeFileSync(join(dashboardsDir(), "no-spec-here", "notes.md"), "hi");
    // Valid spec, invalid store name → unreachable by name, so not listed.
    mkdirSync(join(dashboardsDir(), "UPPER"), { recursive: true });
    writeFileSync(
      join(dashboardsDir(), "UPPER", "dashboard.json"),
      '{"title":"Nope"}',
    );
    mkdirSync(join(dashboardsDir(), "has space"), { recursive: true });
    writeFileSync(
      join(dashboardsDir(), "has space", "dashboard.json"),
      '{"title":"Nope"}',
    );
    // Stray non-json file at the top level, and a flat file with a bad stem.
    writeFileSync(join(dashboardsDir(), "README.md"), "# notes");
    writeFileSync(join(dashboardsDir(), "UPPER.json"), '{"title":"Nope"}');

    expect(listDashboards().map((e) => e.name)).toEqual(["real"]);
  });

  it("returns [] on a machine with no store yet instead of throwing", () => {
    expect(existsSync(dashboardsDir())).toBe(false);
    expect(listDashboards()).toEqual([]);
  });
});

describe("getDefault — tolerance to a corrupt config.json", () => {
  it("degrades a truncated config.json to no default, and still lists", () => {
    writeHealthy("main", "Main board");
    writeConfig('{"default": "mai');

    // No SyntaxError escapes readConfig…
    expect(getDefault()).toBeNull();
    // …and the listing survives, just with nothing flagged as the default.
    expect(listDashboards()).toEqual([
      {
        name: "main",
        file: dashboardPath("main"),
        title: "Main board",
        isDefault: false,
      },
    ]);
  });

  it("degrades non-object and wrong-typed config bodies to no default", () => {
    for (const raw of ['"main"', "42", "null", "[]", '["main"]']) {
      writeConfig(raw);
      expect(getDefault()).toBeNull();
    }
    for (const cfg of [{ default: 42 }, { default: "" }, { default: null }]) {
      writeConfig(JSON.stringify(cfg));
      expect(getDefault()).toBeNull();
    }
  });

  it("setDefault recovers a corrupt config.json into a valid one", () => {
    writeConfig("{ this is not json");

    setDefault("main");

    expect(getDefault()).toBe("main");
    const raw = readFileSync(configPath(), "utf8");
    expect(JSON.parse(raw)).toEqual({ default: "main" });
  });

  it("setDefault merges into config.json, keeping unrelated keys", () => {
    writeConfig(`${JSON.stringify({ default: "old", keepMe: 7 }, null, 2)}\n`);

    setDefault("new");

    const raw = readFileSync(configPath(), "utf8");
    expect(JSON.parse(raw)).toEqual({ default: "new", keepMe: 7 });
    // Human-editable file: pretty-printed, newline-terminated.
    expect(raw).toContain('"default": "new"');
    expect(raw.endsWith("\n")).toBe(true);
    expect(getDefault()).toBe("new");
  });
});
