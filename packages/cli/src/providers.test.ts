import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getProviders } from "@zframes/store/store";
import { providers } from "./providers";

// Throwaway XDG_CONFIG_HOME per test so the real store is never touched (the
// same harness the store's own suite uses — storeHome reads the env live).
let xdg: string;
let prevXdg: string | undefined;

beforeEach(() => {
  xdg = mkdtempSync(join(tmpdir(), "zframes-xdg-"));
  prevXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = xdg;
});

afterEach(() => {
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXdg;
  rmSync(xdg, { recursive: true, force: true });
});

describe("zframes providers", () => {
  it("lists the demo fallback and every available plugin on a bare install", () => {
    const result = providers([]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("DEMO data");
    for (const id of ["keyless", "binance", "wallet"])
      expect(result.stdout).toContain(id);
  });

  it("add installs, prints the install-time notice, and persists mount order", () => {
    const added = providers(["add", "keyless"]);
    expect(added.code).toBe(0);
    // The notice is the consent surface: what it contacts (with the relay
    // grants marked) and where the terms live.
    expect(added.stdout).toContain("contacts:");
    expect(added.stdout).toContain("(relay)");
    expect(added.stdout).toContain("terms:");
    expect(providers(["add", "binance"]).code).toBe(0);
    expect(getProviders()).toEqual(["keyless", "binance"]);

    const listed = providers(["list"]);
    expect(listed.stdout).toContain("installed");
    expect(listed.stdout).not.toContain("DEMO data");
  });

  it("add is idempotent and refuses unknown ids", () => {
    expect(providers(["add", "keyless"]).code).toBe(0);
    const again = providers(["add", "keyless"]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("already installed");
    expect(getProviders()).toEqual(["keyless"]);

    const unknown = providers(["add", "nope"]);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain('"nope"');
  });

  it("remove uninstalls and says when the demo fallback takes over", () => {
    providers(["add", "keyless"]);
    providers(["add", "wallet"]);
    expect(providers(["remove", "wallet"]).stdout).not.toContain("DEMO");
    const last = providers(["remove", "keyless"]);
    expect(last.code).toBe(0);
    expect(last.stdout).toContain("DEMO");
    expect(getProviders()).toEqual([]);

    const missing = providers(["remove", "keyless"]);
    expect(missing.code).toBe(1);
  });

  it("rejects unknown actions and missing ids", () => {
    expect(providers(["frobnicate"]).code).toBe(1);
    expect(providers(["add"]).code).toBe(1);
    expect(providers(["remove"]).code).toBe(1);
  });
});
