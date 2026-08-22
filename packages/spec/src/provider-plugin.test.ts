// The plugin contract is the boundary where operator-installed, dynamically
// imported code meets the runtime, so every assertion here is about a HOSTILE
// or careless input: a module shape nobody validated, a host string that can
// never match, a manifest that would mount and silently do nothing. The loader
// warns and skips on failure, so a false "ok" is the expensive direction.
import { describe, expect, it } from "vitest";
import {
  capabilitiesOf,
  proxyHostsOf,
  sourceCreditsOf,
  validateProviderPlugin,
  type ProviderPluginManifest,
} from "./provider-plugin";

function manifest(
  overrides: Partial<ProviderPluginManifest> = {},
): ProviderPluginManifest {
  return {
    id: "example",
    name: "Example",
    capabilities: ["day-stats"],
    sources: [{ id: "example", name: "Example", url: "https://example.com" }],
    hosts: [{ host: "api.example.com", proxied: true }],
    ...overrides,
  };
}

const createProviders = () => [];

describe("validateProviderPlugin", () => {
  it("accepts a well-formed plugin", () => {
    const result = validateProviderPlugin({
      manifest: manifest(),
      createProviders,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a default export, since an author may write either shape", () => {
    const result = validateProviderPlugin({
      default: { manifest: manifest(), createProviders },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a module with no manifest at all", () => {
    const result = validateProviderPlugin({ createProviders });
    expect(result).toEqual({
      ok: false,
      errors: ["not an object with a `manifest`"],
    });
  });

  it("rejects a missing factory", () => {
    const result = validateProviderPlugin({ manifest: manifest() });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("createProviders: expected a function");
  });

  // A host carrying a scheme, a port or a path compares against URL.hostname
  // and can therefore never match. Left unchecked it reads as an authorised
  // host that silently never works, which is worse than a rejected install.
  // The last three are the normalisation cases: URL spells 0x7f.0.0.1 as
  // 127.0.0.1 (so the entry is both dead AND a disguised loopback) and refuses
  // the out-of-range and five-part shapes outright.
  it.each([
    "https://api.example.com",
    "api.example.com:443",
    "api.example.com/v1",
    "*.example.com",
    "0x7f.0.0.1",
    "999.1.1.1",
    "1.2.3.4.5",
  ])("rejects %s as a host", (host) => {
    const result = validateProviderPlugin({
      manifest: manifest({ hosts: [{ host, proxied: true }] }),
      createProviders,
    });
    expect(result.ok).toBe(false);
  });

  // Once a mount derives its allowlist from installed manifests, one of these
  // in a manifest turns the same-origin relay into a reader for the operator's
  // own network. 169.254.169.254 is the cloud instance-metadata address, which
  // is the one that matters most and looks the most innocuous in a diff.
  it.each([
    "localhost",
    "app.localhost",
    "internal.corp",
    "db.internal",
    "printer.local",
    "service.home.arpa",
    "nas.lan",
    "ci.test",
    "box.localdomain",
    "router.home",
    "127.0.0.1",
    "10.0.0.5",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.254",
    "169.254.169.254",
    "100.64.0.1",
    "100.127.255.254",
    "198.18.0.1",
    "224.0.0.1",
    "0.0.0.0",
    "..",
    "-leading.example.com",
    "trailing-.example.com",
    "trailing.dot.",
  ])("rejects %s as a host", (host) => {
    const result = validateProviderPlugin({
      manifest: manifest({ hosts: [{ host, proxied: true }] }),
      createProviders,
    });
    expect(result.ok).toBe(false);
  });

  // Public space that merely looks private-adjacent must still pass, or a real
  // upstream gets refused for resembling one that should be.
  it.each([
    "api.example.com",
    "cdn.cboe.com",
    "172.15.0.1",
    "172.32.0.1",
    "11.0.0.1",
    "169.253.0.1",
    "100.63.255.254",
    "100.128.0.1",
    "198.17.0.1",
    "198.20.0.1",
    "223.255.255.253",
    "corporate.example.com",
  ])("accepts %s as a host", (host) => {
    const result = validateProviderPlugin({
      manifest: manifest({ hosts: [{ host, proxied: true }] }),
      createProviders,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a plugin declaring no capability, which could never route", () => {
    const result = validateProviderPlugin({
      manifest: manifest({ capabilities: [] }),
      createProviders,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join()).toContain("nothing can route");
  });

  // The chrome watermarks a synthetic board. A manifest claiming both is a
  // contradiction its author has to resolve, not one to guess at here.
  it("rejects a synthetic plugin that names hosts", () => {
    const result = validateProviderPlugin({
      manifest: manifest({ synthetic: true }),
      createProviders,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join()).toContain("must declare no hosts");
  });

  it("accepts a synthetic plugin with no hosts", () => {
    const result = validateProviderPlugin({
      manifest: manifest({ synthetic: true, hosts: [] }),
      createProviders,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a source id that a card's `source` field could not hold", () => {
    const result = validateProviderPlugin({
      manifest: manifest({
        sources: [{ id: "Example Venue", name: "x", url: "https://x.com" }],
      }),
      createProviders,
    });
    expect(result.ok).toBe(false);
  });

  it("collects every failure rather than stopping at the first", () => {
    const result = validateProviderPlugin({
      manifest: {
        id: "BAD ID",
        name: "",
        capabilities: [],
        sources: [],
        hosts: [],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(2);
  });
});

describe("proxyHostsOf", () => {
  // Serve starts from an empty set, so this is the only thing standing between
  // "no plugins installed" and "the relay can reach something".
  it("is empty for no plugins", () => {
    expect(proxyHostsOf([])).toEqual([]);
  });

  it("includes only proxied hosts, lowercased, sorted, deduplicated", () => {
    const hosts = proxyHostsOf([
      manifest({
        hosts: [
          { host: "Zeta.example.com", proxied: true },
          { host: "cors-open.example.com" },
          { host: "alpha.example.com", proxied: true },
        ],
      }),
      manifest({ hosts: [{ host: "alpha.example.com", proxied: true }] }),
    ]);
    expect(hosts).toEqual(["alpha.example.com", "zeta.example.com"]);
  });
});

describe("sourceCreditsOf", () => {
  it("dedupes by id with the first mounted plugin winning", () => {
    const credits = sourceCreditsOf([
      manifest({
        sources: [{ id: "dup", name: "First", url: "https://a.com" }],
      }),
      manifest({
        sources: [{ id: "dup", name: "Second", url: "https://b.com" }],
      }),
    ]);
    expect(credits).toEqual([
      { id: "dup", name: "First", url: "https://a.com" },
    ]);
  });
});

describe("capabilitiesOf", () => {
  it("unions and dedupes", () => {
    const capabilities = capabilitiesOf([
      manifest({ capabilities: ["day-stats", "ohlcv"] }),
      manifest({ capabilities: ["ohlcv", "tvl"] }),
    ]);
    expect([...capabilities].sort()).toEqual(["day-stats", "ohlcv", "tvl"]);
  });
});
