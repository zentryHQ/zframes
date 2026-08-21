// The manifest is a hand-written description of code that lives elsewhere, so
// every assertion here compares it against the real thing rather than restating
// it. Restating would pass forever; these fail the moment a provider changes
// what it advertises.
import { describe, expect, it } from "vitest";
import { validateProviderPlugin } from "@zframes/spec/provider-plugin";
import { KEYLESS_MANIFEST, createProviders } from "./manifest";
import { createKeylessProviders } from "./index";

describe("KEYLESS_MANIFEST", () => {
  it("is a plugin the loader would accept", () => {
    const result = validateProviderPlugin({
      manifest: KEYLESS_MANIFEST,
      createProviders,
    });
    // Print the reasons rather than a bare `false`: the failure is always a
    // specific field, and hunting it in a 50-host manifest is the slow part.
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  // The manifest is what `zframes providers` shows an assembling agent, so a
  // capability the fleet serves but the manifest omits reads as unavailable and
  // the agent never writes the frame that needs it. Constructing the fleet is
  // the only honest source for this: both sides are plain string literals off
  // the same type-only union, and nothing else connects them.
  it("declares exactly the capabilities the fleet advertises", () => {
    const advertised = new Set(
      createKeylessProviders().flatMap((provider) => [
        ...provider.capabilities,
      ]),
    );
    expect([...KEYLESS_MANIFEST.capabilities].sort()).toEqual(
      [...advertised].sort(),
    );
  });

  it("declares no capability twice", () => {
    expect(new Set(KEYLESS_MANIFEST.capabilities).size).toBe(
      KEYLESS_MANIFEST.capabilities.length,
    );
  });

  // A duplicated host or credit id is not a validation error — `proxyHostsOf`
  // and `sourceCreditsOf` both dedupe — but it is how one entry's `reason` or
  // `notes` silently loses to another's when the manifest is edited in two
  // places.
  it("names each host once", () => {
    const hosts = KEYLESS_MANIFEST.hosts.map((entry) => entry.host);
    expect(new Set(hosts).size).toBe(hosts.length);
  });

  it("credits each source id once", () => {
    const ids = KEYLESS_MANIFEST.sources.map((credit) => credit.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // `sourceField()` is the only place a card's `source` string is constrained,
  // and the catalogue's vocabulary is meant to come from this manifest once the
  // fleet is installed rather than bundled. If one of these three ids drifts,
  // every board that pinned it loses its venue.
  it("keeps the three pinnable venue ids", () => {
    const ids = KEYLESS_MANIFEST.sources.map((credit) => credit.id);
    expect(ids).toContain("hyperliquid");
    expect(ids).toContain("bitkub");
    expect(ids).toContain("nasdaq");
  });
});
