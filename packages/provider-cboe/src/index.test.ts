import { afterEach, describe, expect, it, vi } from "vitest";
import type { CboeProvider as CboeProviderType } from "./index";
import { parseOccSymbol } from "./occ";

// What this file pins, and why it matters:
//
//  1. **The OCC parse, from the right.** Expiry, strike and side exist nowhere
//     in a Cboe row except inside the contract id, and the root that precedes
//     them is variable-length. A left-to-right parse assuming four letters
//     reads Ford's date out of its strike field and returns a plausible-looking
//     wrong contract — no error, just a chain plotted at the wrong strikes.
//  2. **`iv: 0` means "no quote", not "zero vol"** — and the greeks are
//     deliberately NOT treated the same way, because a near-zero gamma is real.
//  3. **A malformed row costs that row, not the card.**
//  4. **One deterministic order** (expiry → strike → calls before puts) so no
//     frame re-sorts, and so an OI ladder and a term-structure table agree.
//  5. **403 is the "no listed options" answer.** The CDN is an S3 bucket, so a
//     missing chain is AccessDenied rather than 404; a raw "failed: 403" would
//     read as a permissions bug in the runtime.
//  6. **The two IV scales in one response.** Per-contract `iv` is a decimal,
//     the underlying's `iv30` is a percent. Passing iv30 through unscaled
//     reports 4268% volatility.
//  7. **The 15-minute delay is in the data**, not a comment somewhere.
type Ctor = typeof CboeProviderType;

/** Re-import per test: the TtlCache is module-level, so state must not leak. */
async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.CboeProvider;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function stubChain(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body, status));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A chain row with sane defaults; override only what a test is about. */
function row(option: string, over: Record<string, unknown> = {}) {
  return {
    option,
    bid: 1.2,
    bid_size: 10,
    ask: 1.3,
    ask_size: 12,
    iv: 0.35,
    open_interest: 100,
    volume: 25,
    delta: 0.5,
    gamma: 0.02,
    vega: 0.11,
    theta: -0.09,
    rho: 0.03,
    theo: 1.25,
    last_trade_price: 1.24,
    last_trade_time: "2026-08-05T15:22:27",
    ...over,
  };
}

function chain(rows: unknown[], data: Record<string, unknown> = {}) {
  return {
    timestamp: "2026-08-06 09:20:13",
    symbol: "NVDA",
    data: {
      symbol: "NVDA",
      security_type: "stock",
      current_price: 219.15,
      iv30: 42.682,
      options: rows,
      ...data,
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseOccSymbol", () => {
  it("parses a standard four-letter root", () => {
    expect(parseOccSymbol("NVDA260805C00110000")).toEqual({
      root: "NVDA",
      expiry: "2026-08-05",
      side: "call",
      strike: 110,
    });
  });

  it("parses a ONE-character root", () => {
    // Ford. The whole reason the parse is right-anchored: a fixed four-letter
    // assumption would read "F2608" as the root and shift every later field.
    expect(parseOccSymbol("F260918C00012500")).toEqual({
      root: "F",
      expiry: "2026-09-18",
      side: "call",
      strike: 12.5,
    });
  });

  it("parses a five-character root", () => {
    expect(parseOccSymbol("GOOGL270115P00180000")).toEqual({
      root: "GOOGL",
      expiry: "2027-01-15",
      side: "put",
      strike: 180,
    });
  });

  it("parses a root containing digits (adjusted series)", () => {
    // Non-standard/adjusted contracts append a digit to the root; the tail is
    // still fixed-width, so right-anchored parsing handles them unchanged.
    expect(parseOccSymbol("NVDA1260805C00110000")).toMatchObject({
      root: "NVDA1",
      strike: 110,
    });
  });

  it("reads a fractional strike out of the thousandths field", () => {
    expect(parseOccSymbol("NVDA260805P00110500")?.strike).toBe(110.5);
  });

  it("reads the side letter as put", () => {
    expect(parseOccSymbol("NVDA260805P00110000")?.side).toBe("put");
  });

  it.each([
    ["too short to hold the fixed tail", "NVDA260805C0011"],
    ["no root at all", "260805C00110000"],
    ["a side letter that isn't C or P", "NVDA260805X00110000"],
    ["a non-numeric strike field", "NVDA260805C0011000X"],
    ["a non-numeric date field", "NVDA26AA05C00110000"],
    ["an impossible date", "NVDA260231C00110000"],
    ["a zero strike", "NVDA260805C00000000"],
    ["an empty string", ""],
  ])("returns null (never throws) on %s", (_label, id) => {
    expect(parseOccSymbol(id)).toBeNull();
  });
});

describe("CboeProvider", () => {
  it("advertises only the options-chain capability", async () => {
    const Provider = await loadProvider();
    expect(new Provider().capabilities).toEqual(["options-chain"]);
  });

  it("reports the 15-minute delay in the data", async () => {
    const Provider = await loadProvider();
    stubChain(chain([row("NVDA260805C00110000")]));
    const result = await new Provider().getOptionsChain("NVDA");
    // The feed is delayed; a frame can only label it honestly if the provider
    // says so rather than leaving it to a doc comment.
    expect(result.delayMinutes).toBe(15);
  });

  it("uppercases the ticker and strips a HIP-3 dex prefix", async () => {
    const Provider = await loadProvider();
    const fetchMock = stubChain(chain([row("NVDA260805C00110000")]));
    const result = await new Provider().getOptionsChain("xyz:nvda");
    // The CDN keys are case-sensitive object names — `nvda.json` is a 403.
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://cdn.cboe.com/api/global/delayed_quotes/options/NVDA.json",
    );
    expect(result.symbol).toBe("NVDA");
  });

  it("relays through the same-origin proxy in the browser", async () => {
    const Provider = await loadProvider();
    // cdn.cboe.com sends no CORS header, so the browser path MUST be proxied;
    // fetching direct would fail on every board.
    vi.stubGlobal("document", {});
    const fetchMock = stubChain(chain([row("NVDA260805C00110000")]));
    await new Provider().getOptionsChain("NVDA");
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/__zframes/proxy?url=",
    );
  });

  it("maps iv === 0 to undefined but leaves zero greeks alone", async () => {
    const Provider = await loadProvider();
    stubChain(
      chain([
        row("NVDA260805C00110000", {
          iv: 0,
          delta: 1,
          gamma: 0,
          vega: 0,
          theta: 0,
          rho: 0,
        }),
      ]),
    );
    const [contract] = (await new Provider().getOptionsChain("NVDA")).contracts;
    // 0 is an impossible IV, so it's the feed's "no quote" sentinel.
    expect(contract.iv).toBeUndefined();
    // Greeks get no such treatment: a near-zero gamma/vega is real on deep OTM
    // contracts, so there is no value that reliably means "absent".
    expect(contract.gamma).toBe(0);
    expect(contract.vega).toBe(0);
    expect(contract.theta).toBe(0);
    expect(contract.rho).toBe(0);
    expect(contract.delta).toBe(1);
  });

  it("keeps a published non-zero IV as the decimal it is", async () => {
    const Provider = await loadProvider();
    stubChain(chain([row("NVDA260805C00110000", { iv: 0.3531 })]));
    const [contract] = (await new Provider().getOptionsChain("NVDA")).contracts;
    expect(contract.iv).toBe(0.3531);
  });

  it("normalises the underlying's PERCENT iv30 into a decimal", async () => {
    const Provider = await loadProvider();
    stubChain(chain([row("NVDA260805C00110000")], { iv30: 42.682 }));
    const result = await new Provider().getOptionsChain("NVDA");
    // Same response, two scales: per-contract iv is already decimal, iv30 is
    // not. Unscaled, this card would read "4268% 30-day vol".
    expect(result.iv30).toBeCloseTo(0.42682, 8);
    expect(result.underlyingPrice).toBe(219.15);
  });

  it("omits lastPrice on a contract that has never traded", async () => {
    const Provider = await loadProvider();
    stubChain(
      chain([
        row("NVDA260805P00115000", {
          last_trade_price: 0,
          last_trade_time: null,
        }),
      ]),
    );
    const [contract] = (await new Provider().getOptionsChain("NVDA")).contracts;
    // The null timestamp is the honest signal; a 0 price is a real quote for a
    // bid/ask, so it can't double as the sentinel.
    expect(contract.lastPrice).toBeUndefined();
    expect(contract.bid).toBe(1.2);
  });

  it("skips a malformed row instead of failing the whole chain", async () => {
    const Provider = await loadProvider();
    stubChain(
      chain([
        row("NVDA260805C00110000"),
        row("GARBAGE"),
        row("NVDA260805P00110000"),
      ]),
    );
    const { contracts } = await new Provider().getOptionsChain("NVDA");
    expect(contracts.map((c) => c.contract)).toEqual([
      "NVDA260805C00110000",
      "NVDA260805P00110000",
    ]);
  });

  it("sorts by expiry, then strike, then calls before puts", async () => {
    const Provider = await loadProvider();
    stubChain(
      chain([
        row("NVDA261218P00120000"),
        row("NVDA260805P00110000"),
        row("NVDA260805C00120000"),
        row("NVDA260805C00110000"),
        row("NVDA261218C00120000"),
        row("NVDA260805P00120000"),
      ]),
    );
    const { contracts } = await new Provider().getOptionsChain("NVDA");
    expect(contracts.map((c) => `${c.expiry} ${c.strike} ${c.side}`)).toEqual([
      "2026-08-05 110 call",
      "2026-08-05 110 put",
      "2026-08-05 120 call",
      "2026-08-05 120 put",
      "2026-12-18 120 call",
      "2026-12-18 120 put",
    ]);
  });

  it("reports a 403 as 'no listed options', not a transport failure", async () => {
    const Provider = await loadProvider();
    // The CDN is an S3 bucket: a symbol with no published chain answers
    // AccessDenied, NOT 404. Surfacing the raw status reads like a runtime
    // permissions bug rather than "this ticker has no options".
    stubChain({}, 403);
    await expect(new Provider().getOptionsChain("ZZZZQQ")).rejects.toThrow(
      'cboe: no listed options for "ZZZZQQ"',
    );
  });

  it("reports a 404 the same way", async () => {
    const Provider = await loadProvider();
    stubChain({}, 404);
    await expect(new Provider().getOptionsChain("ZZZZQQ")).rejects.toThrow(
      /no listed options/,
    );
  });

  it("lets a real upstream failure through untranslated", async () => {
    const Provider = await loadProvider();
    stubChain({}, 503);
    // A 503 is the CDN being down, not a missing chain — mislabelling it would
    // send a reader hunting for a ticker that's fine.
    await expect(new Provider().getOptionsChain("NVDA")).rejects.toThrow(/503/);
  });

  it("throws on a response with no options array", async () => {
    const Provider = await loadProvider();
    stubChain({ data: { symbol: "NVDA" } });
    await expect(new Provider().getOptionsChain("NVDA")).rejects.toThrow(
      /unexpected options-chain response shape/,
    );
  });

  it("throws when every row is unparseable", async () => {
    const Provider = await loadProvider();
    stubChain(chain([row("GARBAGE"), row("ALSO-BAD")]));
    await expect(new Provider().getOptionsChain("NVDA")).rejects.toThrow(
      /no parseable contracts/,
    );
  });

  it("serves a repeat request from cache — 1.7 MB is not re-downloaded", async () => {
    const Provider = await loadProvider();
    const fetchMock = stubChain(chain([row("NVDA260805C00110000")]));
    const provider = new Provider();
    await provider.getOptionsChain("NVDA");
    await provider.getOptionsChain("xyz:NVDA");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent loads onto a single request", async () => {
    const Provider = await loadProvider();
    const fetchMock = stubChain(chain([row("NVDA260805C00110000")]));
    const provider = new Provider();
    await Promise.all([
      provider.getOptionsChain("NVDA"),
      provider.getOptionsChain("NVDA"),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a different underlying on its own cache key", async () => {
    const Provider = await loadProvider();
    const fetchMock = stubChain(chain([row("NVDA260805C00110000")]));
    const provider = new Provider();
    await provider.getOptionsChain("NVDA");
    await provider.getOptionsChain("F");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an empty symbol before it reaches the network", async () => {
    const Provider = await loadProvider();
    const fetchMock = stubChain(chain([row("NVDA260805C00110000")]));
    await expect(new Provider().getOptionsChain("  ")).rejects.toThrow(
      /no symbol given/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
