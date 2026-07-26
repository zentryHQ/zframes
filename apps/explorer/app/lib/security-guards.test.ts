// Pins the explorer's two publish-boundary guards — the whole defence between a
// community-submitted spec and the strangers who later render it:
//
//   findUnsafeUrls (app/lib/sanitize-spec.ts) — POST /api/dashboards answers 400
//     when any string ANYWHERE in the parsed spec resolves to a dangerous URL
//     scheme. Frames like image / link-grid render config strings straight into
//     <img src> / <a href>, so a javascript: / data: / vbscript: / file: /
//     blob: / filesystem: value there is stored XSS or phishing on other users.
//   sameOrigin (app/lib/same-origin.ts) — CSRF defence-in-depth layered over the
//     SameSite=Lax session cookie, used by POST /api/dashboards and the per-id
//     PATCH/DELETE routes (Better Auth's own origin guard covers only
//     /api/auth/*).
//
// Both regress silently, in OPPOSITE directions, from a one-token edit:
// loosening reopens the hole while the route still answers 201/200, and
// tightening makes legitimate publishing impossible (403, or "unsafe URL scheme"
// on a clean spec). So this file pins both directions — every denylisted scheme
// plus the browser normalisations `new URL` deliberately sees through (a regex
// would not), AND the false-positive side: plain titles, bare tickers,
// venue-prefixed symbols like "xyz:TSLA", ordinary https URLs.
//
// Pure functions, no I/O — no fetch stubbing, no timers, no DOM. Note that until
// this file landed nothing under apps/ was collected by the root vitest include
// glob, so neither guard had ever executed in CI.
import { describe, expect, it } from "vitest";
import { findUnsafeUrls } from "./sanitize-spec";
import { sameOrigin } from "./same-origin";

describe("findUnsafeUrls", () => {
  describe("denylisted schemes (the hole it closes)", () => {
    it.each([
      ["javascript:", "javascript:alert(1)"],
      ["data:", "data:text/html,<script>alert(1)</script>"],
      ["vbscript:", "vbscript:msgbox(1)"],
      ["file:", "file:///etc/passwd"],
      ["blob:", "blob:https://evil.example/9f0e"],
      ["filesystem:", "filesystem:https://evil.example/temporary/x"],
    ])("flags a bare %s URL", (_protocol, url) => {
      expect(findUnsafeUrls(url)).toEqual([url]);
    });

    it("rejects even a benign-looking data: image (no inline-asset carve-out)", () => {
      // Deliberate strictness: image frames cannot ship data: URIs at all,
      // because the same field would accept data:text/html.
      const png =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA=";
      expect(findUnsafeUrls({ frames: [{ config: { src: png } }] })).toEqual([
        png,
      ]);
    });
  });

  describe("normalisations the WHATWG parser sees through", () => {
    it("flags a leading-tab variant, reporting the raw submitted string", () => {
      // `new URL` strips leading C0 controls/spaces, so the browser would run
      // this — the report keeps the raw value so the author sees what they sent.
      expect(findUnsafeUrls("\tjavascript:alert(1)")).toEqual([
        "\tjavascript:alert(1)",
      ]);
    });

    it("flags a newline embedded inside the scheme", () => {
      expect(findUnsafeUrls("java\nscript:alert(1)")).toEqual([
        "java\nscript:alert(1)",
      ]);
    });

    it("flags mixed case", () => {
      expect(findUnsafeUrls("JaVaScript:alert(1)")).toEqual([
        "JaVaScript:alert(1)",
      ]);
    });

    it("flags leading spaces before the scheme", () => {
      expect(findUnsafeUrls("   javascript:alert(1)")).toEqual([
        "   javascript:alert(1)",
      ]);
    });
  });

  describe("false-positive direction (over-tightening blocks all publishing)", () => {
    it.each([
      ["a plain title", "My Crypto Board"],
      ["a bare ticker", "BTC"],
      ["a venue-prefixed symbol", "xyz:TSLA"],
      ["an ordinary https image URL", "https://example.com/x.png"],
      ["an http URL", "http://example.com/x.png"],
      ["a relative asset path", "/hero.png"],
      ["a mailto link", "mailto:someone@example.com"],
      ["an empty string", ""],
      ["a colon-in-prose title", "Note: read this first"],
    ])("passes %s", (_label, value) => {
      expect(findUnsafeUrls(value)).toEqual([]);
    });

    it("passes a realistic clean spec whole", () => {
      const spec = {
        version: "1.0.0",
        title: "Macro watch",
        author: "micky",
        grid: { columns: 12, rowHeight: 96, gap: 12 },
        background: { type: "unicorn", opacity: 0.15 },
        frames: [
          { frame: "price-chart", config: { symbol: "xyz:TSLA", venue: null } },
          {
            frame: "image",
            config: { src: "https://cdn.example.com/hero.png", alt: "hero" },
          },
          {
            frame: "link-grid",
            config: {
              links: [
                { label: "Docs", url: "https://zframes.dev/docs" },
                { label: "Repo", url: "https://github.com/zentryHQ/zframes" },
              ],
            },
          },
        ],
      };
      expect(findUnsafeUrls(spec)).toEqual([]);
    });

    it("ignores non-string leaves (numbers, booleans, null, undefined)", () => {
      expect(
        findUnsafeUrls({
          columns: 12,
          listed: true,
          venue: null,
          note: undefined,
          nested: [1, false, null],
        }),
      ).toEqual([]);
    });
  });

  describe("recursion (link-grid config is an ARRAY of objects)", () => {
    it("finds a URL nested through frames → config → links[] → url", () => {
      const spec = {
        frames: [
          { frame: "note", config: { markdown: "hello" } },
          {
            frame: "link-grid",
            config: {
              links: [
                { label: "safe", url: "https://example.com" },
                { label: "gotcha", url: "javascript:alert(1)" },
              ],
            },
          },
        ],
      };
      expect(findUnsafeUrls(spec)).toEqual(["javascript:alert(1)"]);
    });

    it("finds the one dangerous entry in an array of strings", () => {
      expect(
        findUnsafeUrls([
          "https://a.example/1.png",
          "vbscript:msgbox(1)",
          "https://b.example/2.png",
        ]),
      ).toEqual(["vbscript:msgbox(1)"]);
    });

    it("accumulates every dangerous URL, in traversal order", () => {
      const spec = {
        title: "javascript:alert('title')",
        frames: [
          { frame: "image", config: { src: "data:text/html,x" } },
          {
            frame: "link-grid",
            config: { links: [{ url: "file:///etc/passwd" }] },
          },
        ],
      };
      expect(findUnsafeUrls(spec)).toEqual([
        "javascript:alert('title')",
        "data:text/html,x",
        "file:///etc/passwd",
      ]);
    });

    it("truncates each reported entry to 80 chars", () => {
      const long = `javascript:alert("${"A".repeat(200)}")`;
      const found = findUnsafeUrls(long);
      expect(found).toHaveLength(1);
      expect(found[0]).toHaveLength(80);
      expect(found[0]).toBe(long.slice(0, 80));
    });

    it("appends into a caller-supplied accumulator and returns that same array", () => {
      const out = ["pre-existing"];
      const returned = findUnsafeUrls({ src: "javascript:alert(1)" }, out);
      // Identity matters: the recursion relies on one shared array.
      expect(returned).toBe(out);
      expect(out).toEqual(["pre-existing", "javascript:alert(1)"]);
    });
  });
});

describe("sameOrigin", () => {
  /** A request as the route sees it: only the headers matter. */
  function requestWith(headers: Record<string, string>): Request {
    return new Request("https://boards.zframes.dev/api/dashboards", {
      method: "POST",
      headers,
    });
  }

  it("allows a request with no Origin at all (the CLI/curl carve-out)", () => {
    // Non-browser callers send no Origin; they still need the session cookie.
    expect(sameOrigin(requestWith({ host: "boards.zframes.dev" }))).toBe(true);
    expect(sameOrigin(requestWith({}))).toBe(true);
  });

  it("allows a matching Origin/Host pair", () => {
    expect(
      sameOrigin(
        requestWith({
          origin: "https://boards.zframes.dev",
          host: "boards.zframes.dev",
        }),
      ),
    ).toBe(true);
  });

  it("allows an Origin whose default port the URL parser drops", () => {
    expect(
      sameOrigin(
        requestWith({
          origin: "https://boards.zframes.dev:443",
          host: "boards.zframes.dev",
        }),
      ),
    ).toBe(true);
  });

  it("allows an Origin whose host differs only by case (parser lower-cases it)", () => {
    expect(
      sameOrigin(
        requestWith({
          origin: "https://BOARDS.zframes.dev",
          host: "boards.zframes.dev",
        }),
      ),
    ).toBe(true);
  });

  it("rejects a cross-site Origin (the CSRF case)", () => {
    expect(
      sameOrigin(
        requestWith({
          origin: "https://evil.example",
          host: "boards.zframes.dev",
        }),
      ),
    ).toBe(false);
  });

  it("rejects a look-alike subdomain of the real host", () => {
    expect(
      sameOrigin(
        requestWith({
          origin: "https://boards.zframes.dev.evil.example",
          host: "boards.zframes.dev",
        }),
      ),
    ).toBe(false);
  });

  it("rejects an unparseable Origin", () => {
    // "null" is what a sandboxed iframe / opaque origin actually sends.
    expect(
      sameOrigin(requestWith({ origin: "null", host: "boards.zframes.dev" })),
    ).toBe(false);
    expect(
      sameOrigin(
        requestWith({ origin: "not a url", host: "boards.zframes.dev" }),
      ),
    ).toBe(false);
  });

  it("compares .host, not .hostname — a port mismatch is rejected", () => {
    // Two dev servers on one machine are different origins to the browser.
    expect(
      sameOrigin(
        requestWith({
          origin: "http://localhost:3000",
          host: "localhost:4000",
        }),
      ),
    ).toBe(false);
    expect(
      sameOrigin(
        requestWith({
          origin: "http://localhost:37264",
          host: "localhost:37264",
        }),
      ),
    ).toBe(true);
  });

  it("fails closed when the Origin is present but the Host header is missing", () => {
    // `new URL(origin).host === null` → false, so the route answers 403.
    expect(
      sameOrigin(requestWith({ origin: "https://boards.zframes.dev" })),
    ).toBe(false);
  });

  it("compares hosts only — the scheme is not part of the check", () => {
    // The Host header carries no scheme, so an http:// page on the SAME host
    // passes. Pinned so a future scheme check is a conscious change, not a
    // surprise 403 for local http dev.
    expect(
      sameOrigin(
        requestWith({
          origin: "http://boards.zframes.dev",
          host: "boards.zframes.dev",
        }),
      ),
    ).toBe(true);
  });
});
