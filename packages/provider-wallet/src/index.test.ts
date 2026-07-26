import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Portfolio } from "@zframes/spec";
import type { WalletProvider as WalletProviderType } from "./index";

/**
 * Contract pinned by this file: the keyless on-chain wallet provider — the one
 * provider that reports a reader's REAL money. Three things here are silently
 * catastrophic when they regress, because the frame looks perfectly healthy:
 *
 *  1. **Calldata.** `balanceOf(address)` is hand-assembled: the 4-byte selector
 *     + 12 zero bytes + the 20-byte address, lower-cased (74 chars total). A
 *     padding slip reads a different storage slot — or another address's
 *     balance — and nothing in the UI hints at it.
 *  2. **Decimals.** Every token scales by its OWN decimals (USDC 6, WBTC 8, ETH
 *     18), so the tests below feed three wildly different raw magnitudes that
 *     must all land on 1.0. A swap under-reports a stablecoin by 1e12.
 *  3. **RPC failover.** A throttled "keyless" endpoint answers HTTP 200 with a
 *     single JSON-RPC error OBJECT, or with an array carrying no `result` rows.
 *     Both must fall through to the next endpoint: accepting either reports
 *     every balance as zero — an EMPTY portfolio rather than an error card,
 *     the worst possible failure mode for this frame.
 *
 * Plus the assembly rules (price join, $1 dust floor, value-desc sort, total),
 * the single shared price call, ENS resolution, and the deliberate cache split —
 * public prices persist to localStorage, wallet holdings never do.
 *
 * The two TtlCaches are module-level singletons whose in-memory entries never
 * reset between tests, and stale-on-error is on by default — so one primed
 * portfolio would mask every error path below. Each test therefore takes a
 * genuinely FRESH module via vi.resetModules() + a dynamic import.
 */
type Ctor = typeof WalletProviderType;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.WalletProvider;
}

/** A minimal Response-like the stubbed global fetch resolves to. */
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

type ResponseLike = ReturnType<typeof jsonResponse>;

/** The public RPC endpoints, in the exact failover order the source tries. */
const RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://cloudflare-eth.com",
  "https://1rpc.io/eth",
];
const PRICE_ENDPOINT = "https://api.coingecko.com/api/v3/simple/price";
const ENS_ENDPOINT = "https://api.ensideas.com/ens/resolve/";

/**
 * The bundled token list, in the order the source declares it — the batch `id`
 * of each call IS its index here, so this table pins the id↔token mapping, the
 * ERC-20 contract addresses (with their checksum casing), the per-token
 * decimals, and the CoinGecko id list used for pricing. Adding a token to the
 * provider means extending this table.
 */
const TOKEN_ORDER = [
  { symbol: "ETH", address: null, decimals: 18, cgId: "ethereum" },
  {
    symbol: "USDC",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
    cgId: "usd-coin",
  },
  {
    symbol: "USDT",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6,
    cgId: "tether",
  },
  {
    symbol: "DAI",
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    decimals: 18,
    cgId: "dai",
  },
  {
    symbol: "WETH",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    decimals: 18,
    cgId: "weth",
  },
  {
    symbol: "WBTC",
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    decimals: 8,
    cgId: "wrapped-bitcoin",
  },
  {
    symbol: "LINK",
    address: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    decimals: 18,
    cgId: "chainlink",
  },
  {
    symbol: "UNI",
    address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    decimals: 18,
    cgId: "uniswap",
  },
  {
    symbol: "AAVE",
    address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
    decimals: 18,
    cgId: "aave",
  },
  {
    symbol: "LDO",
    address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32",
    decimals: 18,
    cgId: "lido-dao",
  },
  {
    symbol: "MKR",
    address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2",
    decimals: 18,
    cgId: "maker",
  },
  {
    symbol: "CRV",
    address: "0xD533a949740bb3306d119CC777fa900bA034cd52",
    decimals: 18,
    cgId: "curve-dao-token",
  },
  {
    symbol: "SHIB",
    address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
    decimals: 18,
    cgId: "shiba-inu",
  },
  {
    symbol: "PEPE",
    address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
    decimals: 18,
    cgId: "pepe",
  },
];

// Deliberately mixed-case so the lower-casing in the calldata is observable, and
// shaped so the shortened label is exactly "0x1234…cdef".
const ADDR = `0x1234${"aBcD".repeat(8)}cdef`;
const ADDR_2 = "0xabcdef0123456789abcdef0123456789abcdef01";
// vitalik.eth, checksum-cased — used to prove ENS resolution feeds the calldata.
const RESOLVED = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

// Raw base-unit quantities (verified against BigInt): each of these is 1.0 of
// its token once scaled by that token's decimals, and they differ by 12 orders
// of magnitude — so one shared divisor cannot satisfy all three.
const ONE_18 = "0xde0b6b3a7640000"; // 1e18 wei      → 1.0 ETH / DAI / LINK
const HALF_18 = "0x6f05b59d3b20000"; // 5e17          → 0.5
const ONE_6 = "0x0f4240"; // 1e6           → 1.0 USDC / USDT
const ONE_8 = "0x5f5e100"; // 1e8           → 1.0 WBTC

interface RpcCall {
  jsonrpc: string;
  id: number;
  method: string;
  params: unknown[];
}

/**
 * A JSON-RPC batch reply carrying one row per token, in id order. Symbols listed
 * in `results` get that hex `result`; every other row is returned WITHOUT a
 * `result` field, exactly as a partially-answering endpoint does. Note the
 * source rejects a batch where NO row has a result, so at least one entry is
 * needed for the reply to be accepted.
 */
function batchReply(results: Record<string, string>) {
  return TOKEN_ORDER.map((token, id) => {
    const hex = results[token.symbol];
    return hex === undefined ? { id } : { id, result: hex };
  });
}

/**
 * Route every stubbed request by URL — one getPortfolio touches up to three
 * different hosts (ENS, an RPC endpoint, CoinGecko), so a single-response mock
 * would feed the price body to the RPC batch. By default only the FIRST RPC
 * endpoint answers (with `balances`); pass `rpc` to script the failover order.
 * An unrecognised URL throws, so a typo can't quietly look like a network error.
 */
function walletFetch(
  opts: {
    balances?: Record<string, string>;
    rpc?: Record<string, ResponseLike>;
    prices?: unknown;
    ens?: ResponseLike;
  } = {},
) {
  // Typed as the real fetch signature so `mock.mock.calls[n][1]` carries the
  // RequestInit the provider sent (method, headers, the JSON-RPC body).
  const mock = vi.fn<
    (url: string, init?: RequestInit) => Promise<ResponseLike>
  >((url) => {
    const target = String(url);
    if (target.startsWith(PRICE_ENDPOINT))
      return Promise.resolve(jsonResponse(opts.prices ?? {}));
    if (target.startsWith(ENS_ENDPOINT))
      return Promise.resolve(opts.ens ?? jsonResponse({}, 404));
    if (RPC_URLS.includes(target)) {
      if (opts.rpc)
        return Promise.resolve(opts.rpc[target] ?? jsonResponse(null, 503));
      return Promise.resolve(
        target === RPC_URLS[0]
          ? jsonResponse(batchReply(opts.balances ?? {}))
          : jsonResponse(null, 503),
      );
    }
    throw new Error(`unexpected fetch: ${target}`);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

type FetchMock = ReturnType<typeof walletFetch>;

function urlsOf(mock: FetchMock): string[] {
  return mock.mock.calls.map((call) => String(call[0]));
}

function rpcUrlsOf(mock: FetchMock): string[] {
  return urlsOf(mock).filter((url) => RPC_URLS.includes(url));
}

function priceUrlsOf(mock: FetchMock): string[] {
  return urlsOf(mock).filter((url) => url.startsWith(PRICE_ENDPOINT));
}

/** The JSON-RPC batch body of the nth RPC POST the provider made. */
function batchFrom(mock: FetchMock, nth = 0): RpcCall[] {
  const call = mock.mock.calls.filter((c) => RPC_URLS.includes(String(c[0])))[
    nth
  ];
  return JSON.parse(String(call?.[1]?.body)) as RpcCall[];
}

function callTo(call: RpcCall): { to: string; data: string } {
  return call.params[0] as { to: string; data: string };
}

function symbolsOf(portfolio: Portfolio): string[] {
  return portfolio.holdings.map((h) => h.symbol);
}

function amountOf(portfolio: Portfolio, symbol: string): number | undefined {
  return portfolio.holdings.find((h) => h.symbol === symbol)?.amount;
}

describe("WalletProvider", () => {
  let WalletProvider: Ctor;

  beforeEach(async () => {
    // Fresh module → fresh, empty walletCache/priceCache for this test.
    WalletProvider = await loadProvider();
  });

  afterEach(() => {
    // Also drops the localStorage shim the persistence test installs.
    vi.unstubAllGlobals();
  });

  it("advertises the keyless wallet source of the portfolio capability", () => {
    const provider = new WalletProvider();
    expect(provider.name).toBe("On-chain wallet");
    expect(provider.capabilities).toEqual(["portfolio"]);
    expect(provider.portfolioKinds).toEqual(["wallet"]);
  });

  it("refuses a source that is not a wallet with an address", async () => {
    const mock = walletFetch();
    const provider = new WalletProvider();

    await expect(provider.getPortfolio({ kind: "binance" })).rejects.toThrow(
      "wallet provider needs a wallet source with an address",
    );
    await expect(
      provider.getPortfolio({ kind: "wallet", address: "" }),
    ).rejects.toThrow("wallet provider needs a wallet source with an address");
    // Nothing was fetched — the guard runs before any network work.
    expect(mock).not.toHaveBeenCalled();
  });

  describe("the JSON-RPC batch", () => {
    it("POSTs one batch in token order, native ETH first, id = index", async () => {
      const mock = walletFetch({ balances: { ETH: ONE_18 } });
      await new WalletProvider().getPortfolio({
        kind: "wallet",
        address: ADDR,
      });

      // One POST, to the primary endpoint, with a JSON content type.
      expect(rpcUrlsOf(mock)).toEqual([RPC_URLS[0]]);
      const init = mock.mock.calls[0][1];
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>)["content-type"]).toBe(
        "application/json",
      );

      const batch = batchFrom(mock);
      expect(batch).toHaveLength(TOKEN_ORDER.length);
      // `id` is the index into the token list — the amounts are re-joined by id,
      // so a reordering here silently attributes one token's balance to another.
      expect(batch.map((call) => call.id)).toEqual(
        TOKEN_ORDER.map((_, index) => index),
      );
      expect(batch.every((call) => call.jsonrpc === "2.0")).toBe(true);
      expect(batch.map((call) => call.method)).toEqual(
        TOKEN_ORDER.map((token) =>
          token.address === null ? "eth_getBalance" : "eth_call",
        ),
      );

      // Native ETH reads the account balance directly.
      expect(batch[0].params).toEqual([ADDR, "latest"]);
      // Every ERC-20 call targets its own contract, checksum casing intact, at
      // the latest block.
      expect(batch.slice(1).map((call) => callTo(call).to)).toEqual(
        TOKEN_ORDER.slice(1).map((token) => token.address),
      );
      expect(batch.slice(1).map((call) => call.params[1])).toEqual(
        TOKEN_ORDER.slice(1).map(() => "latest"),
      );
    });

    it("builds balanceOf calldata as selector + 12 zero bytes + lower-cased address", async () => {
      const mock = walletFetch({ balances: { ETH: ONE_18 } });
      await new WalletProvider().getPortfolio({
        kind: "wallet",
        address: ADDR,
      });

      const usdc = callTo(batchFrom(mock)[1]);
      // 0x + 8 selector nibbles + 24 padding nibbles + 40 address nibbles.
      expect(usdc.data).toHaveLength(74);
      expect(usdc.data).toBe(
        "0x70a08231" +
          "000000000000000000000000" +
          "1234abcdabcdabcdabcdabcdabcdabcdabcdcdef",
      );
      // The address is lower-cased in the calldata even though the caller (and
      // the contract address itself) are checksum-cased.
      expect(usdc.data.endsWith(ADDR.slice(2).toLowerCase())).toBe(true);
      expect(usdc.data).not.toContain("B");
      // Every ERC-20 row carries the identical calldata (same holder).
      for (const call of batchFrom(mock).slice(1))
        expect(callTo(call).data).toBe(usdc.data);
    });
  });

  describe("base-unit scaling", () => {
    it("scales each token by its own decimals (USDC 6, WBTC 8, ETH 18)", async () => {
      walletFetch({
        balances: {
          ETH: ONE_18,
          USDC: ONE_6,
          WBTC: ONE_8,
          LINK: HALF_18,
        },
        prices: {
          ethereum: { usd: 3000 },
          "usd-coin": { usd: 1 },
          "wrapped-bitcoin": { usd: 60_000 },
          chainlink: { usd: 20 },
        },
      });

      const portfolio = await new WalletProvider().getPortfolio({
        kind: "wallet",
        address: ADDR,
      });

      // Three raw quantities twelve orders of magnitude apart all become 1.0 —
      // only per-token decimals can do that.
      expect(amountOf(portfolio, "ETH")).toBe(1);
      expect(amountOf(portfolio, "USDC")).toBe(1);
      expect(amountOf(portfolio, "WBTC")).toBe(1);
      expect(amountOf(portfolio, "LINK")).toBe(0.5);
    });

    it("treats 0x, a missing row and unparseable hex as zero — and then makes no price call", async () => {
      const mock = walletFetch({
        // ETH answers (so the batch is accepted) but with an empty quantity;
        // USDC is unparseable, DAI is an explicit zero, everything else has no
        // `result` row at all.
        balances: { ETH: "0x", USDC: "0xnothex", DAI: "0x0" },
        prices: { ethereum: { usd: 3000 } },
      });

      const portfolio = await new WalletProvider().getPortfolio({
        kind: "wallet",
        address: ADDR,
      });

      expect(portfolio.holdings).toEqual([]);
      expect(portfolio.totalUsd).toBe(0);
      expect(portfolio.source).toBe("wallet");
      // An address holding nothing must not spend a CoinGecko rate-limit token.
      expect(priceUrlsOf(mock)).toEqual([]);
      expect(mock).toHaveBeenCalledTimes(1);
    });

    it("drops a zero-balance token instead of emitting a zero row", async () => {
      walletFetch({
        balances: { ETH: ONE_18, USDC: "0x0" },
        prices: { ethereum: { usd: 3000 }, "usd-coin": { usd: 1 } },
      });

      const portfolio = await new WalletProvider().getPortfolio({
        kind: "wallet",
        address: ADDR,
      });

      // USDC is priced and would have joined fine — it is absent because a zero
      // amount never enters the balance map at all.
      expect(symbolsOf(portfolio)).toEqual(["ETH"]);
      expect(portfolio.holdings.every((h) => h.amount > 0)).toBe(true);
    });
  });

  describe("RPC failover", () => {
    it("falls through an HTTP 500 to the next endpoint and uses its balances", async () => {
      const mock = walletFetch({
        rpc: {
          [RPC_URLS[0]]: jsonResponse(null, 500),
          [RPC_URLS[1]]: jsonResponse(batchReply({ ETH: ONE_18 })),
        },
        prices: { ethereum: { usd: 3000 } },
      });

      const portfolio = await new WalletProvider().getPortfolio({
        kind: "wallet",
        address: ADDR,
      });

      // The second endpoint was actually called, the third never was.
      expect(rpcUrlsOf(mock)).toEqual([RPC_URLS[0], RPC_URLS[1]]);
      // …and the balance came from it.
      expect(portfolio.holdings).toEqual([
        { symbol: "ETH", amount: 1, valueUsd: 3000, changePct24h: undefined },
      ]);
    });

    it("falls through a 200 carrying a single JSON-RPC error object, not an array", async () => {
      const mock = walletFetch({
        rpc: {
          // The exact throttle shape a keyless endpoint answers with: HTTP 200,
          // one error OBJECT. Accepting it would crash the for…of or read every
          // balance as zero.
          [RPC_URLS[0]]: jsonResponse({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32001, message: "api key required" },
          }),
          [RPC_URLS[1]]: jsonResponse(batchReply({ WBTC: ONE_8 })),
        },
        prices: { "wrapped-bitcoin": { usd: 60_000 } },
      });

      const portfolio = await new WalletProvider().getPortfolio({
        kind: "wallet",
        address: ADDR,
      });

      expect(rpcUrlsOf(mock)).toEqual([RPC_URLS[0], RPC_URLS[1]]);
      expect(symbolsOf(portfolio)).toEqual(["WBTC"]);
      expect(portfolio.totalUsd).toBe(60_000);
    });

    it("falls through a 200 array whose rows carry no result", async () => {
      const mock = walletFetch({
        rpc: {
          // Well-formed batch, every row answered with an error instead of a
          // result — indistinguishable from "holds nothing" if accepted.
          [RPC_URLS[0]]: jsonResponse(
            TOKEN_ORDER.map((_, id) => ({
              id,
              error: { code: -32005, message: "limit exceeded" },
            })),
          ),
          [RPC_URLS[1]]: jsonResponse(batchReply({ ETH: HALF_18 })),
        },
        prices: { ethereum: { usd: 3000 } },
      });

      const portfolio = await new WalletProvider().getPortfolio({
        kind: "wallet",
        address: ADDR,
      });

      expect(rpcUrlsOf(mock)).toEqual([RPC_URLS[0], RPC_URLS[1]]);
      expect(portfolio.holdings).toEqual([
        { symbol: "ETH", amount: 0.5, valueUsd: 1500, changePct24h: undefined },
      ]);
    });

    it("throws after every endpoint fails, in order, surfacing the last error", async () => {
      const mock = walletFetch({
        rpc: {
          [RPC_URLS[0]]: jsonResponse(null, 500),
          [RPC_URLS[1]]: jsonResponse({
            error: { message: "api key required" },
          }),
          [RPC_URLS[2]]: jsonResponse(batchReply({})),
        },
        prices: { ethereum: { usd: 3000 } },
      });

      const promise = new WalletProvider().getPortfolio({
        kind: "wallet",
        address: ADDR,
      });
      await expect(promise).rejects.toThrow(/all RPC endpoints failed/);
      // The last endpoint's own reason is carried out, not swallowed.
      await expect(promise).rejects.toThrow(/no results \(throttled\?\)/);
      await expect(promise).rejects.toThrow(RPC_URLS[2]);

      expect(rpcUrlsOf(mock)).toEqual(RPC_URLS);
      // A failed balance read must never reach the pricing step.
      expect(priceUrlsOf(mock)).toEqual([]);
    });

    it("labels a non-array body that carries no error message", async () => {
      const body = jsonResponse({ result: "not a batch" });
      walletFetch({
        rpc: {
          [RPC_URLS[0]]: body,
          [RPC_URLS[1]]: body,
          [RPC_URLS[2]]: body,
        },
      });

      await expect(
        new WalletProvider().getPortfolio({ kind: "wallet", address: ADDR }),
      ).rejects.toThrow(/non-array response/);
    });
  });

  describe("pricing", () => {
    it("makes one simple/price call for the whole deduped token list", async () => {
      const mock = walletFetch({
        balances: { ETH: ONE_18, USDC: ONE_6 },
        prices: { ethereum: { usd: 3000 }, "usd-coin": { usd: 1 } },
      });

      await new WalletProvider().getPortfolio({
        kind: "wallet",
        address: ADDR,
      });

      const priced = priceUrlsOf(mock);
      expect(priced).toHaveLength(1);
      const url = new URL(priced[0]);
      expect(`${url.origin}${url.pathname}`).toBe(PRICE_ENDPOINT);
      expect(url.searchParams.get("vs_currencies")).toBe("usd");
      expect(url.searchParams.get("include_24hr_change")).toBe("true");
      // Every token in the bundled list is priced in that one call, deduped.
      const ids = (url.searchParams.get("ids") ?? "").split(",");
      expect(ids).toEqual(TOKEN_ORDER.map((token) => token.cgId));
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("shares one price fetch across two different addresses", async () => {
      const mock = walletFetch({
        balances: { ETH: ONE_18 },
        prices: { ethereum: { usd: 3000 } },
      });
      const provider = new WalletProvider();

      const first = await provider.getPortfolio({
        kind: "wallet",
        address: ADDR,
      });
      const second = await provider.getPortfolio({
        kind: "wallet",
        address: ADDR_2,
      });

      // Two distinct wallets → two balance reads, but the price cache is keyed
      // on the constant "all", so CoinGecko is hit once.
      expect(rpcUrlsOf(mock)).toEqual([RPC_URLS[0], RPC_URLS[0]]);
      expect(priceUrlsOf(mock)).toHaveLength(1);
      expect(first.label).toBe("0x1234…cdef");
      expect(second.label).toBe("0xabcd…ef01");
      expect(second.totalUsd).toBe(3000);
    });

    it("throws a labelled shape error when the price body is not an object map", async () => {
      walletFetch({
        balances: { ETH: ONE_18 },
        prices: [{ id: "ethereum", usd: 3000 }],
      });

      await expect(
        new WalletProvider().getPortfolio({ kind: "wallet", address: ADDR }),
      ).rejects.toThrow("coingecko simple/price: unexpected response shape");
    });
  });

  describe("holdings assembly", () => {
    it("values each holding, carries the 24h change, sorts by value desc and totals it", async () => {
      walletFetch({
        balances: { ETH: ONE_18, USDC: ONE_6, WBTC: ONE_8 },
        prices: {
          ethereum: { usd: 3000, usd_24h_change: -2.5 },
          "usd-coin": { usd: 1, usd_24h_change: 0.01 },
          // No usd_24h_change at all → the field stays undefined.
          "wrapped-bitcoin": { usd: 60_000 },
        },
      });

      const portfolio = await new WalletProvider().getPortfolio({
        kind: "wallet",
        address: ADDR,
      });

      // Batch order was ETH, USDC, WBTC; output is value-descending.
      expect(portfolio.holdings).toEqual([
        {
          symbol: "WBTC",
          amount: 1,
          valueUsd: 60_000,
          changePct24h: undefined,
        },
        { symbol: "ETH", amount: 1, valueUsd: 3000, changePct24h: -2.5 },
        { symbol: "USDC", amount: 1, valueUsd: 1, changePct24h: 0.01 },
      ]);
      expect(portfolio.holdings[0].changePct24h).toBeUndefined();
      expect(portfolio.totalUsd).toBe(63_001);
      expect(portfolio.source).toBe("wallet");
      expect(portfolio.asOf).toBeGreaterThan(1_700_000_000_000);
    });

    it("drops a held token that has no price row", async () => {
      walletFetch({
        // A huge PEPE balance, but CoinGecko answered without a pepe row.
        balances: { ETH: ONE_18, PEPE: ONE_18 },
        prices: { ethereum: { usd: 3000 } },
      });

      const portfolio = await new WalletProvider().getPortfolio({
        kind: "wallet",
        address: ADDR,
      });

      expect(symbolsOf(portfolio)).toEqual(["ETH"]);
      expect(portfolio.totalUsd).toBe(3000);
    });

    it("drops dust below $1 but keeps a holding worth exactly $1", async () => {
      walletFetch({
        // 1.0 USDC = $1 exactly (the inclusive floor); 1 base unit of USDT is
        // $0.000001 — priced, parsed, and still dropped as dust.
        balances: { USDC: ONE_6, USDT: "0x1" },
        prices: { "usd-coin": { usd: 1 }, tether: { usd: 1 } },
      });

      const portfolio = await new WalletProvider().getPortfolio({
        kind: "wallet",
        address: ADDR,
      });

      expect(symbolsOf(portfolio)).toEqual(["USDC"]);
      expect(portfolio.totalUsd).toBe(1);
    });
  });

  describe("address resolution", () => {
    it("passes a 0x address through, trimmed, with no ENS lookup", async () => {
      const mock = walletFetch({
        balances: { ETH: ONE_18 },
        prices: { ethereum: { usd: 3000 } },
      });

      const portfolio = await new WalletProvider().getPortfolio({
        kind: "wallet",
        address: `  ${ADDR}  `,
      });

      expect(urlsOf(mock).some((url) => url.includes("ensideas"))).toBe(false);
      // The trimmed address is what reaches the chain and the label.
      expect(batchFrom(mock)[0].params).toEqual([ADDR, "latest"]);
      expect(portfolio.label).toBe("0x1234…cdef");
    });

    it("resolves a .eth name and uses the resolved address everywhere", async () => {
      const mock = walletFetch({
        ens: jsonResponse({ address: RESOLVED }),
        balances: { ETH: ONE_18 },
        prices: { ethereum: { usd: 3000 } },
      });

      const portfolio = await new WalletProvider().getPortfolio({
        kind: "wallet",
        address: "vitalik.eth",
      });

      expect(urlsOf(mock)[0]).toBe(
        "https://api.ensideas.com/ens/resolve/vitalik.eth",
      );
      // The chain call reads the RESOLVED address, not the name…
      expect(batchFrom(mock)[0].params).toEqual([RESOLVED, "latest"]);
      expect(callTo(batchFrom(mock)[1]).data).toBe(
        `0x70a08231${"0".repeat(24)}${RESOLVED.slice(2).toLowerCase()}`,
      );
      // …and so does the label.
      expect(portfolio.label).toBe("0xd8dA…6045");
    });

    it("rejects an ENS reply whose address is not 0x + 40 hex", async () => {
      const mock = walletFetch({
        ens: jsonResponse({ address: "0x1234" }),
        balances: { ETH: ONE_18 },
      });

      await expect(
        new WalletProvider().getPortfolio({
          kind: "wallet",
          address: "vitalik.eth",
        }),
      ).rejects.toThrow("couldn't resolve address: vitalik.eth");
      // Resolution failed, so no chain read was attempted with a bad address.
      expect(rpcUrlsOf(mock)).toEqual([]);
    });

    it("throws when the ENS lookup itself fails", async () => {
      walletFetch({ ens: jsonResponse(null, 500), balances: { ETH: ONE_18 } });

      await expect(
        new WalletProvider().getPortfolio({
          kind: "wallet",
          address: "nope.eth",
        }),
      ).rejects.toThrow(/couldn't resolve address: nope\.eth/);
    });
  });

  describe("caching", () => {
    it("persists public prices but never the wallet's holdings", async () => {
      const store = new Map<string, string>();
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      });
      walletFetch({
        balances: { ETH: ONE_18 },
        prices: { ethereum: { usd: 3000 } },
      });

      await new WalletProvider().getPortfolio({
        kind: "wallet",
        address: ADDR,
      });

      // Exactly one persisted key: the shared price map. The portfolio cache is
      // persist:false on purpose — holdings are wallet-specific and must not be
      // left in the browser's storage.
      expect([...store.keys()]).toEqual(["zframes:wallet:prices:all"]);
      const persisted = JSON.parse(store.get("zframes:wallet:prices:all")!) as {
        value: unknown;
      };
      expect(persisted.value).toEqual({ ethereum: { usd: 3000 } });
      expect([...store.values()].join()).not.toContain(ADDR.slice(2, 10));
    });

    it("serves a repeated address from the per-address cache without re-reading the chain", async () => {
      const mock = walletFetch({
        balances: { ETH: ONE_18 },
        prices: { ethereum: { usd: 3000 } },
      });
      const provider = new WalletProvider();

      const first = await provider.getPortfolio({
        kind: "wallet",
        address: ADDR,
      });
      // A brand-new instance shares the module-level cache.
      const second = await new WalletProvider().getPortfolio({
        kind: "wallet",
        address: ADDR,
      });

      expect(second).toBe(first);
      expect(rpcUrlsOf(mock)).toEqual([RPC_URLS[0]]);
      expect(priceUrlsOf(mock)).toHaveLength(1);
    });
  });
});
