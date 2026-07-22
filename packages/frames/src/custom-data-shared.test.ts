import { describe, expect, it } from "vitest";
import {
  clampText,
  extractByPath,
  isBlockedHost,
  MAX_PATH_LENGTH,
  MAX_POINTS,
  MAX_TEXT,
  numericCells,
  parsePath,
  toCells,
  validateCustomUrl,
} from "./custom-data-shared";
import { customDataMeta } from "./schemas";

describe("parsePath", () => {
  it("parses dot paths", () => {
    expect(parsePath("hourly.temperature_2m")).toEqual([
      { kind: "key", key: "hourly" },
      { kind: "key", key: "temperature_2m" },
    ]);
  });

  it("parses bracket indices and wildcards", () => {
    expect(parsePath("data[0].items[*].price")).toEqual([
      { kind: "key", key: "data" },
      { kind: "index", index: 0 },
      { kind: "key", key: "items" },
      { kind: "wildcard" },
      { kind: "key", key: "price" },
    ]);
  });

  it("parses a bare * segment as a wildcard", () => {
    expect(parsePath("results.*.value")).toEqual([
      { kind: "key", key: "results" },
      { kind: "wildcard" },
      { kind: "key", key: "value" },
    ]);
  });

  it.each(["__proto__", "constructor", "prototype"])(
    "refuses the prototype-chain segment %s",
    (seg) => {
      expect(() => parsePath(seg)).toThrow(/not allowed/);
      expect(() => parsePath(`a.${seg}.b`)).toThrow(/not allowed/);
    },
  );

  it("refuses string keys inside brackets (no quoted-key syntax)", () => {
    expect(() => parsePath('a["__proto__"]')).toThrow(/bad bracket/);
    expect(() => parsePath("a[foo]")).toThrow(/bad bracket/);
    expect(() => parsePath("a[-1]")).toThrow(/bad bracket/);
  });

  it("refuses empty and over-long paths", () => {
    expect(() => parsePath("")).toThrow(/empty/);
    expect(() => parsePath("a..b")).toThrow(/empty path segment/);
    expect(() => parsePath("a.".repeat(120) + "b")).toThrow(
      new RegExp(String(MAX_PATH_LENGTH)),
    );
    expect(() => parsePath(Array(20).fill("a").join("."))).toThrow(/deeper/);
  });
});

describe("extractByPath", () => {
  it("extracts scalars, nested keys, and indices", () => {
    const body = { data: [{ price: 42.5 }, { price: 7 }], total: 9 };
    expect(extractByPath(body, "total")).toBe(9);
    expect(extractByPath(body, "data[1].price")).toBe(7);
    expect(extractByPath(body, "data[*].price")).toEqual([42.5, 7]);
  });

  it("returns undefined for unresolved paths instead of throwing", () => {
    expect(extractByPath({ a: 1 }, "b.c")).toBeUndefined();
    expect(extractByPath(null, "a")).toBeUndefined();
    expect(extractByPath("scalar", "a")).toBeUndefined();
  });

  it("reads own properties only — never the prototype chain", () => {
    expect(extractByPath({ a: 1 }, "toString")).toBeUndefined();
    expect(extractByPath({ a: 1 }, "hasOwnProperty")).toBeUndefined();
    // Array prototype methods are equally unreachable (keys don't apply to arrays).
    expect(extractByPath([1, 2], "map")).toBeUndefined();
  });

  it("cannot be used to pollute or read Object.prototype", () => {
    // A JSON body carrying __proto__ as an own key is inert: the path that
    // would traverse it is refused, and nothing is ever written.
    const hostile = JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}');
    expect(() => extractByPath(hostile, "__proto__.polluted")).toThrow(
      /not allowed/,
    );
    expect(extractByPath(hostile, "ok")).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("caps wildcard fan-out at MAX_POINTS", () => {
    const big = { items: Array.from({ length: 5000 }, (_, i) => ({ v: i })) };
    const out = extractByPath(big, "items[*].v") as unknown[];
    expect(out).toHaveLength(MAX_POINTS);
  });

  it("caps nested-wildcard flattening at MAX_POINTS", () => {
    const big = {
      groups: Array.from({ length: 100 }, () => ({
        vals: Array.from({ length: 100 }, (_, i) => i),
      })),
    };
    const out = extractByPath(big, "groups[*].vals[*]") as unknown[];
    expect(out.length).toBeLessThanOrEqual(MAX_POINTS);
  });

  it("skips wildcard elements where the sub-path is missing", () => {
    const body = { items: [{ v: 1 }, { other: 2 }, { v: 3 }] };
    expect(extractByPath(body, "items[*].v")).toEqual([1, 3]);
  });
});

describe("validateCustomUrl / isBlockedHost", () => {
  it("accepts public https URLs", () => {
    expect(validateCustomUrl("https://api.open-meteo.com/v1/forecast")).toBe(
      null,
    );
    expect(
      validateCustomUrl("https://api.coingecko.com/api/v3/simple/price?x=1"),
    ).toBe(null);
  });

  it("rejects non-https schemes", () => {
    expect(validateCustomUrl("http://api.example.com")).toMatch(/https/);
    expect(validateCustomUrl("ftp://example.com")).toMatch(/https/);
    expect(validateCustomUrl("javascript:alert(1)")).toMatch(/https|valid/);
    expect(validateCustomUrl("file:///etc/passwd")).toMatch(/https/);
  });

  it("rejects malformed URLs and embedded credentials", () => {
    expect(validateCustomUrl("not a url")).toMatch(/valid/);
    expect(validateCustomUrl("https://user:pass@example.com/")).toMatch(
      /credentials/,
    );
  });

  it("rejects loopback, private, link-local, and CGNAT hosts", () => {
    for (const host of [
      "localhost",
      "foo.localhost",
      "myrouter.local",
      "svc.internal",
      "127.0.0.1",
      "127.9.9.9",
      "0.0.0.0",
      "10.0.0.5",
      "192.168.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.1.1",
      "100.64.0.1",
      "[::1]",
      "[fc00::1]",
      "[fe80::1]",
    ]) {
      expect(validateCustomUrl(`https://${host}/api`)).toMatch(/private/);
    }
  });

  it("allows public hosts near the blocked ranges", () => {
    expect(isBlockedHost("172.15.0.1")).toBe(false);
    expect(isBlockedHost("172.32.0.1")).toBe(false);
    expect(isBlockedHost("100.63.0.1")).toBe(false);
    expect(isBlockedHost("11.0.0.1")).toBe(false);
    expect(isBlockedHost("192.169.0.1")).toBe(false);
  });
});

describe("toCells / clampText / numericCells", () => {
  it("wraps scalars, coerces numeric strings, keeps text", () => {
    expect(toCells(42)).toEqual([42]);
    expect(toCells("42.5")).toEqual([42.5]);
    expect(toCells(["a", 1, true, null])).toEqual(["a", 1, "true", "—"]);
  });

  it("clamps long strings so a hostile body can't flood the DOM", () => {
    const long = "x".repeat(10_000);
    const [cell] = toCells(long);
    expect((cell as string).length).toBeLessThanOrEqual(MAX_TEXT + 1);
    expect(clampText(long)).toHaveLength(MAX_TEXT + 1);
  });

  it("renders objects as clamped JSON previews, never raw markup", () => {
    const [cell] = toCells([{ a: "<img onerror=x>" }]);
    expect(typeof cell).toBe("string");
    expect((cell as string).length).toBeLessThanOrEqual(MAX_TEXT + 1);
  });

  it("drops non-finite numbers from chart input", () => {
    expect(numericCells(toCells([1, "2", "nope", Infinity, NaN]))).toEqual([
      1, 2,
    ]);
  });

  it("caps cell count at MAX_POINTS", () => {
    expect(toCells(Array(5000).fill(1))).toHaveLength(MAX_POINTS);
  });
});

describe("customDataMeta schema", () => {
  it("parses with all defaults (drag-in renders immediately)", () => {
    const parsed = customDataMeta.schema.parse({});
    expect(parsed.url).toMatch(/^https:\/\//);
    expect(parsed.display).toBe("stat");
  });

  it("rejects http and private URLs at lint time", () => {
    expect(
      customDataMeta.schema.safeParse({ url: "http://api.example.com" })
        .success,
    ).toBe(false);
    expect(
      customDataMeta.schema.safeParse({ url: "https://192.168.1.1/api" })
        .success,
    ).toBe(false);
  });

  it("bounds the refresh interval", () => {
    expect(customDataMeta.schema.safeParse({ refreshMinutes: 0 }).success).toBe(
      false,
    );
    expect(
      customDataMeta.schema.safeParse({ refreshMinutes: 10_000 }).success,
    ).toBe(false);
  });
});
