/**
 * Pins the keyless plugin manifest's proxied hosts equal to serve's
 * `PROXY_ALLOW_HOSTS`.
 *
 * Two lists describe the same fact while the migration is in flight: the
 * hard-coded allowlist that governs the running relay today, and the manifest's
 * `hosts` that `proxyHostsOf` will derive it from tomorrow. Either can be edited
 * alone, and both directions fail in the dark. A host added to the manifest but
 * not the allowlist is a provider whose fetch 4xxs through the proxy, which the
 * frame surfaces as an empty card rather than an error anyone reads. A host
 * dropped from the manifest but left in the allowlist is reach the relay still
 * grants that no install authorised, which is the whole thing the plugin
 * contract exists to close.
 *
 * It lives in repo-level `tests/` because it must import both sides at once:
 * ESLint's layer DAG forbids `@zframes/serve` from inside `providers-keyless`
 * (a React-free data leaf must never pull in Node infra), so relative imports
 * from here are the only place the two can meet. Same reason as the sibling
 * cross-boundary guards.
 */
import { describe, expect, it } from "vitest";
import { KEYLESS_MANIFEST } from "../packages/providers-keyless/src/manifest";
import { proxyHostsOf } from "../packages/spec/src/provider-plugin";
import { PROXY_ALLOW_HOSTS } from "../packages/serve/src/proxy-allowlist";

const derived = proxyHostsOf([KEYLESS_MANIFEST]);
const allowlisted = [...PROXY_ALLOW_HOSTS].sort();

describe("keyless manifest ↔ serve proxy allowlist", () => {
  it("derives exactly the allowlist", () => {
    expect(derived).toEqual(allowlisted);
  });

  // Stated separately from the equality above so a failure names the drifting
  // hosts instead of diffing two 24-entry arrays.
  it("declares no proxied host the allowlist omits", () => {
    expect(derived.filter((host) => !PROXY_ALLOW_HOSTS.has(host))).toEqual([]);
  });

  it("declares every allowlisted host", () => {
    const declared = new Set(derived);
    expect(allowlisted.filter((host) => !declared.has(host))).toEqual([]);
  });

  // A CORS-open host does not belong in the relay: the browser reaches it
  // itself, and an entry would hand the local process reach it never needs.
  it("keeps CORS-open hosts out of the relay", () => {
    const open = KEYLESS_MANIFEST.hosts
      .filter((entry) => !entry.proxied)
      .map((entry) => entry.host);
    expect(open.filter((host) => PROXY_ALLOW_HOSTS.has(host))).toEqual([]);
    // Guard against the trivial pass where nothing is CORS-open at all.
    expect(open.length).toBeGreaterThan(20);
  });
});
