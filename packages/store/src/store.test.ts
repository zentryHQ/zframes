import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  classifyTarget,
  dashboardPath,
  dashboardsDir,
  findDashboardFile,
  getDefault,
  isValidName,
  listDashboards,
  resolveServeTarget,
  setDefault,
  storeHome,
} from "./store";

// Each test runs against a throwaway XDG_CONFIG_HOME so the real store is never
// touched and the home reads back deterministically (storeHome reads the env
// live). `cwd` is a separate tmp dir for the cwd-relative resolution branches.
let xdg: string;
let cwd: string;
let prevXdg: string | undefined;

function writeDash(name: string, title = name): void {
  // Folder layout: dashboards/<name>/dashboard.json.
  mkdirSync(dirname(dashboardPath(name)), { recursive: true });
  writeFileSync(
    dashboardPath(name),
    `${JSON.stringify({ title, frames: [] })}\n`,
  );
}

/** Write a legacy flat dashboards/<name>.json (pre-folder layout). */
function writeFlatDash(name: string, title = name): void {
  mkdirSync(dashboardsDir(), { recursive: true });
  writeFileSync(
    join(dashboardsDir(), `${name}.json`),
    `${JSON.stringify({ title, frames: [] })}\n`,
  );
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

describe("isValidName", () => {
  it("accepts kebab/snake tokens, rejects paths and noise", () => {
    expect(isValidName("crypto")).toBe(true);
    expect(isValidName("my-dash_2")).toBe(true);
    expect(isValidName("Crypto")).toBe(false); // uppercase
    expect(isValidName("a/b")).toBe(false); // separator
    expect(isValidName("..")).toBe(false); // traversal
    expect(isValidName(".hidden")).toBe(false); // leading dot
    expect(isValidName("")).toBe(false);
    expect(isValidName("a".repeat(65))).toBe(false); // too long
  });
});

describe("storeHome", () => {
  it("honours XDG_CONFIG_HOME", () => {
    expect(storeHome()).toBe(join(xdg, "zframes"));
    expect(dashboardsDir()).toBe(join(xdg, "zframes", "dashboards"));
  });
});

describe("classifyTarget", () => {
  it("treats a bare token as a store name", () => {
    expect(classifyTarget("crypto", cwd)).toEqual({
      kind: "store",
      name: "crypto",
      file: dashboardPath("crypto"),
    });
  });

  it("treats anything path-shaped as a filesystem path", () => {
    expect(classifyTarget("dashboard.json", cwd)).toEqual({
      kind: "path",
      file: join(cwd, "dashboard.json"),
    });
    expect(classifyTarget("./foo", cwd)).toEqual({
      kind: "path",
      file: join(cwd, "foo"),
    });
    expect(classifyTarget("sub/dash.json", cwd)).toEqual({
      kind: "path",
      file: join(cwd, "sub", "dash.json"),
    });
  });

  it("errors on an invalid bare token (not path-shaped, not a valid name)", () => {
    expect("error" in classifyTarget("Bad Name", cwd)).toBe(true);
    expect("error" in classifyTarget("UPPER", cwd)).toBe(true);
  });
});

describe("default + list", () => {
  it("starts with no default", () => {
    expect(getDefault()).toBeNull();
  });

  it("sets/reads the default and lists dashboards sorted with the default flagged", () => {
    writeDash("main", "Main board");
    writeDash("crypto", "Crypto board");
    setDefault("main");
    expect(getDefault()).toBe("main");
    const entries = listDashboards();
    expect(entries.map((e) => e.name)).toEqual(["crypto", "main"]);
    expect(entries.find((e) => e.name === "main")?.isDefault).toBe(true);
    expect(entries.find((e) => e.name === "crypto")?.isDefault).toBe(false);
    expect(entries.find((e) => e.name === "main")?.title).toBe("Main board");
  });
});

describe("folder layout + legacy flat fallback", () => {
  it("dashboardPath points at <name>/dashboard.json (the folder layout)", () => {
    expect(dashboardPath("crypto")).toBe(
      join(dashboardsDir(), "crypto", "dashboard.json"),
    );
  });

  it("findDashboardFile prefers the folder, falls back to a legacy flat file", () => {
    expect(findDashboardFile("ghost")).toBeNull();
    writeFlatDash("legacy");
    expect(findDashboardFile("legacy")).toBe(
      join(dashboardsDir(), "legacy.json"),
    );
    writeDash("modern");
    expect(findDashboardFile("modern")).toBe(dashboardPath("modern"));
  });

  it("lists and serves a legacy flat dashboard alongside folder ones", () => {
    writeFlatDash("old", "Old board");
    writeDash("new", "New board");
    const entries = listDashboards();
    expect(entries.map((e) => e.name)).toEqual(["new", "old"]);
    expect(entries.find((e) => e.name === "old")?.title).toBe("Old board");
    expect(resolveServeTarget("old", cwd)).toEqual({
      kind: "store",
      name: "old",
      file: join(dashboardsDir(), "old.json"),
    });
  });
});

describe("resolveServeTarget — explicit arg", () => {
  it("resolves an existing store name", () => {
    writeDash("main");
    expect(resolveServeTarget("main", cwd)).toEqual({
      kind: "store",
      name: "main",
      file: dashboardPath("main"),
    });
  });

  it("errors (store-aware) on a missing store name", () => {
    const r = resolveServeTarget("ghost", cwd);
    expect("error" in r && r.error).toMatch(/no dashboard named "ghost"/);
  });

  it("resolves an existing path", () => {
    writeFileSync(join(cwd, "d.json"), "{}");
    expect(resolveServeTarget("d.json", cwd)).toEqual({
      kind: "path",
      file: join(cwd, "d.json"),
    });
  });

  it("errors on a missing path", () => {
    const r = resolveServeTarget("missing.json", cwd);
    expect("error" in r && r.error).toMatch(
      /no dashboard\.json at missing\.json/,
    );
  });
});

describe("resolveServeTarget — no arg (global-default-first)", () => {
  it("prefers the configured default over a cwd dashboard.json", () => {
    writeDash("main");
    setDefault("main");
    writeFileSync(join(cwd, "dashboard.json"), "{}"); // present but loses
    expect(resolveServeTarget(undefined, cwd)).toEqual({
      kind: "store",
      name: "main",
      file: dashboardPath("main"),
    });
  });

  it("falls back to ./dashboard.json when no default is set", () => {
    writeFileSync(join(cwd, "dashboard.json"), "{}");
    expect(resolveServeTarget(undefined, cwd)).toEqual({
      kind: "path",
      file: join(cwd, "dashboard.json"),
    });
  });

  it("uses a sole store entry when there's no default and no cwd file", () => {
    writeDash("solo");
    expect(resolveServeTarget(undefined, cwd)).toEqual({
      kind: "store",
      name: "solo",
      file: dashboardPath("solo"),
    });
  });

  it("errors when several store entries exist but no default is set", () => {
    writeDash("a");
    writeDash("b");
    const r = resolveServeTarget(undefined, cwd);
    expect("error" in r && r.error).toMatch(/2 in the store/);
  });

  it("falls through a default that points at a missing file", () => {
    writeDash("real");
    setDefault("ghost"); // default set, but ghost.json doesn't exist
    expect(resolveServeTarget(undefined, cwd)).toEqual({
      kind: "store",
      name: "real",
      file: dashboardPath("real"),
    });
  });

  it("errors with guidance when the store and cwd are both empty", () => {
    const r = resolveServeTarget(undefined, cwd);
    expect("error" in r && r.error).toMatch(/no dashboard found/);
  });
});
