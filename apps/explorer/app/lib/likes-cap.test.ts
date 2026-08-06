import { describe, expect, it } from "vitest";
import { clientIp, utcDay, visitorKeys } from "./likes-cap";

/**
 * The cap's PURE half. Everything here is a value decision that would be silently
 * wrong rather than loudly broken — which is the bar for a test in this app.
 *
 * The DB half (claimLike / bumpGrant / sweepLikeGrants) is deliberately not covered
 * here: `pnpm test` is hermetic and these files never open a connection. The
 * transactional behaviour it relies on — the cap living in the ON CONFLICT WHERE
 * clause, so two concurrent requests cannot both observe `n = 4` — is not something
 * a mocked database can honestly prove. It needs the PGlite socket, which is a
 * separate integration pass (noted in ticket 003's resolution).
 */

const headers = (h: Record<string, string>) => new Headers(h);

describe("clientIp", () => {
  it("prefers x-real-ip, which the platform sets directly", () => {
    expect(clientIp(headers({ "x-real-ip": "203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });

  it("takes the LAST x-forwarded-for hop, not the first", () => {
    // THE WHOLE POINT. x-forwarded-for is appended to by each hop, so a client
    // sending its own header produces "<forged>, <real>". Reading [0] would hand
    // the visitor key straight to the caller — every request could claim a
    // different identity and the cap would be decorative.
    expect(
      clientIp(headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" })),
    ).toBe("203.0.113.7");
  });

  it("handles a single-hop x-forwarded-for", () => {
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });

  it("tolerates whitespace and empty hops", () => {
    expect(
      clientIp(headers({ "x-forwarded-for": " 1.2.3.4 ,  , 203.0.113.7 " })),
    ).toBe("203.0.113.7");
  });

  it("returns null when no proxy header is present (local dev, curl)", () => {
    expect(clientIp(headers({}))).toBeNull();
  });

  it("ignores an empty x-real-ip rather than treating it as an address", () => {
    expect(
      clientIp(headers({ "x-real-ip": "  ", "x-forwarded-for": "9.9.9.9" })),
    ).toBe("9.9.9.9");
  });
});

describe("utcDay", () => {
  it("buckets by UTC date", () => {
    expect(utcDay(new Date("2026-08-06T12:00:00Z"))).toBe("2026-08-06");
  });

  it("does NOT shift with local time — 07:00 Bangkok is still the UTC day before", () => {
    // The accepted cost of a UTC boundary: a Bangkok visitor's allowance resets at
    // 07:00 local, not midnight. Pinned so a well-meaning switch to a local date
    // (which would desync the client mirror) fails here first.
    expect(utcDay(new Date("2026-08-06T23:30:00Z"))).toBe("2026-08-06");
    expect(utcDay(new Date("2026-08-07T00:30:00Z"))).toBe("2026-08-07");
  });
});

describe("visitorKeys", () => {
  const ip = headers({ "x-real-ip": "203.0.113.7" });

  it("never returns the raw address in either key", () => {
    const keys = visitorKeys(ip, "browser-a");
    expect(keys.itemKey).not.toContain("203.0.113.7");
    expect(keys.ipKey).not.toContain("203.0.113.7");
  });

  it("gives two browsers on ONE ip different item keys but the SAME ip key", () => {
    // This is the shared-IP fix and the backstop, in one assertion. Different item
    // keys = an office of 30 is not one allowance. Same ip key = rotating the
    // browser id cannot escape the cross-item ceiling.
    const a = visitorKeys(ip, "browser-a");
    const b = visitorKeys(ip, "browser-b");
    expect(a.itemKey).not.toBe(b.itemKey);
    expect(a.ipKey).toBe(b.ipKey);
  });

  it("gives the same browser id on two different ips different keys", () => {
    const a = visitorKeys(headers({ "x-real-ip": "203.0.113.7" }), "same-id");
    const b = visitorKeys(headers({ "x-real-ip": "198.51.100.4" }), "same-id");
    expect(a.itemKey).not.toBe(b.itemKey);
    expect(a.ipKey).not.toBe(b.ipKey);
  });

  it("is stable for the same inputs", () => {
    expect(visitorKeys(ip, "browser-a")).toEqual(visitorKeys(ip, "browser-a"));
  });

  it("buckets a missing browser id under one allowance rather than exempting it", () => {
    // A client that sends no id must not get an unlimited supply of fresh keys.
    const a = visitorKeys(ip, null);
    const b = visitorKeys(ip, null);
    expect(a.itemKey).toBe(b.itemKey);
  });

  it("separates the item key from the ip key for the same address", () => {
    // Both are hashes of the same IP; a shared domain string would let one grant's
    // row satisfy the other's primary key.
    const keys = visitorKeys(headers({ "x-real-ip": "203.0.113.7" }), null);
    expect(keys.itemKey).not.toBe(keys.ipKey);
  });

  it("buckets no-proxy callers together under 'unknown'", () => {
    const a = visitorKeys(headers({}), "b1");
    const b = visitorKeys(headers({}), "b1");
    expect(a.ipKey).toBe(b.ipKey);
  });
});
