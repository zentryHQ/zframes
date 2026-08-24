import { describe, expect, it } from "vitest";
import { validateProviderPlugin } from "@zframes/spec/provider-plugin";
import { BUILTIN_PLUGINS, resolveInstallation } from "./registry";

describe("BUILTIN_PLUGINS", () => {
  it("keys every manifest by its own id", () => {
    for (const [id, manifest] of BUILTIN_PLUGINS) {
      expect(manifest.id).toBe(id);
    }
  });

  // The registry's manifests feed `zframes providers` and the derived
  // allowlist without ever loading provider code, so each must already be a
  // manifest the loader-side validator would accept — a registry entry that
  // fails validation is installable on paper and dead in the browser.
  it("registers only manifests the plugin validator accepts", () => {
    for (const [id, manifest] of BUILTIN_PLUGINS) {
      const result = validateProviderPlugin({
        manifest,
        createProviders: () => [],
      });
      expect(result.ok ? [] : result.errors, id).toEqual([]);
    }
  });

  it("covers the four first-party plugins", () => {
    expect([...BUILTIN_PLUGINS.keys()].sort()).toEqual([
      "binance",
      "demo",
      "keyless",
      "wallet",
    ]);
  });
});

describe("resolveInstallation", () => {
  it("mounts the demo plugin when nothing is installed", () => {
    for (const installed of [null, undefined, []] as const) {
      const installation = resolveInstallation(installed);
      expect(installation.manifests.map((m) => m.id)).toEqual(["demo"]);
      expect(installation.demoFallback).toBe(true);
      expect(installation.unknown).toEqual([]);
    }
  });

  it("mounts installed plugins in list order, without the demo", () => {
    const installation = resolveInstallation(["keyless", "binance"]);
    expect(installation.manifests.map((m) => m.id)).toEqual([
      "keyless",
      "binance",
    ]);
    expect(installation.demoFallback).toBe(false);
  });

  it("reports unknown ids and still mounts the known ones", () => {
    const installation = resolveInstallation(["nope", "keyless"]);
    expect(installation.unknown).toEqual(["nope"]);
    expect(installation.manifests.map((m) => m.id)).toEqual(["keyless"]);
    expect(installation.demoFallback).toBe(false);
  });

  it("falls back to the demo when nothing installed resolves", () => {
    const installation = resolveInstallation(["nope"]);
    expect(installation.unknown).toEqual(["nope"]);
    expect(installation.manifests.map((m) => m.id)).toEqual(["demo"]);
    expect(installation.demoFallback).toBe(true);
  });

  it("drops duplicate ids (a double mount would double-construct sockets)", () => {
    const installation = resolveInstallation(["keyless", "keyless"]);
    expect(installation.manifests.map((m) => m.id)).toEqual(["keyless"]);
  });
});
