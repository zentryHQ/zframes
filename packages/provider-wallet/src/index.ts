import type {
  Capability,
  Holding,
  MarketDataProvider,
  Portfolio,
  PortfolioSource,
  PortfolioSourceKind,
} from "@zframes/core";
import { TtlCache } from "@zframes/core/cache";
import { fetchJson } from "@zframes/core/fetch";

/**
 * Keyless provider for a public Ethereum address (the wallet source of the
 * `portfolio` capability). It reads native ETH + a bundled list of major ERC-20
 * balances through a public RPC, prices them via CoinGecko, and returns the same
 * normalized Portfolio shape as the keyed Binance provider — so the portfolio
 * frames are source-agnostic. No keys, no signing, no relay: an address is
 * public data, fetched straight from the browser.
 *
 * v1 is Ethereum mainnet + a curated top-token set. Broader multichain coverage
 * (and a possible BYO data-source key) is a deliberate later step.
 */

// Public, keyless, CORS-open JSON-RPC endpoints, tried in order until one returns
// a valid batch array. publicnode is primary; cloudflare-eth and 1rpc are keyless
// CORS-open fallbacks. (ankr was dropped — its keyless tier now requires an API
// key and answers with HTTP 200 + a single JSON-RPC error object, not the batch
// array, which fetchBalances rejects below so it falls through instead of
// crashing on a non-iterable response.)
const RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://cloudflare-eth.com",
  "https://1rpc.io/eth",
];
const COINGECKO_PRICE = "https://api.coingecko.com/api/v3/simple/price";
// balanceOf(address) selector.
const BALANCE_OF = "0x70a08231";
// Drop dust below this USD value so the readout stays legible.
const DUST_USD = 1;

interface Token {
  symbol: string;
  /** Contract address, or null for native ETH. */
  address: string | null;
  decimals: number;
  /** CoinGecko id for pricing. */
  cgId: string;
}

const NATIVE: Token = {
  symbol: "ETH",
  address: null,
  decimals: 18,
  cgId: "ethereum",
};

const TOKENS: Token[] = [
  NATIVE,
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

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Resolve an ENS name to an address (keyless), or pass a 0x address through. */
async function resolveAddress(input: string): Promise<string> {
  const value = input.trim();
  if (ADDRESS_RE.test(value)) return value;
  // Best-effort keyless ENS resolution; 0x addresses are the reliable path.
  try {
    const data = await fetchJson<{ address?: string }>(
      `https://api.ensideas.com/ens/resolve/${encodeURIComponent(value)}`,
    );
    if (data.address && ADDRESS_RE.test(data.address)) return data.address;
  } catch {
    /* fall through to the error below */
  }
  throw new Error(`couldn't resolve address: ${value}`);
}

interface RpcCall {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown[];
}

/** balanceOf calldata: selector + 32-byte left-padded address. */
function balanceOfData(address: string): string {
  return `${BALANCE_OF}000000000000000000000000${address.slice(2).toLowerCase()}`;
}

/** Convert a hex wei/base-unit quantity to a human amount. */
function toAmount(hex: string | undefined, decimals: number): number {
  if (!hex || hex === "0x") return 0;
  try {
    return Number(BigInt(hex)) / 10 ** decimals;
  } catch {
    return 0;
  }
}

async function fetchBalances(address: string): Promise<Map<string, number>> {
  const batch: RpcCall[] = TOKENS.map((token, id) =>
    token.address === null
      ? {
          jsonrpc: "2.0",
          id,
          method: "eth_getBalance",
          params: [address, "latest"],
        }
      : {
          jsonrpc: "2.0",
          id,
          method: "eth_call",
          params: [
            { to: token.address, data: balanceOfData(address) },
            "latest",
          ],
        },
  );
  const payload = JSON.stringify(batch);
  let rows: Array<{ id: number; result?: string }> | null = null;
  let lastError: unknown;
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) throw new Error(`rpc ${res.status}`);
      const body: unknown = await res.json();
      // Some "keyless" endpoints answer a throttle with HTTP 200 + a single
      // JSON-RPC error object instead of the batch array (ankr, cloudflare-eth
      // under load). Reject anything that isn't an array carrying at least one
      // result, so we fall through to the next endpoint instead of crashing on a
      // non-iterable `for…of` or silently reading every balance as zero.
      if (!Array.isArray(body)) {
        const message =
          (body as { error?: { message?: string } })?.error?.message ??
          "non-array response";
        throw new Error(`rpc ${url}: ${message}`);
      }
      const batchRows = body as Array<{ id: number; result?: string }>;
      if (!batchRows.some((row) => typeof row.result === "string"))
        throw new Error(`rpc ${url}: no results (throttled?)`);
      rows = batchRows;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!rows) throw new Error(`all RPC endpoints failed: ${String(lastError)}`);
  const byId = new Map<number, string>();
  for (const row of rows) if (row.result) byId.set(row.id, row.result);

  const amounts = new Map<string, number>();
  TOKENS.forEach((token, id) => {
    const amount = toAmount(byId.get(id), token.decimals);
    if (amount > 0) amounts.set(token.symbol, amount);
  });
  return amounts;
}

type PriceRow = { usd?: number; usd_24h_change?: number };

// Every token we might price, deduped — fetched in one call under a single cache
// key so all wallet frames (any address) share one CoinGecko response.
const ALL_CG_IDS = [...new Set(TOKENS.map((t) => t.cgId))];

// CoinGecko's keyless tier is the most rate-limited source we touch, and a burst
// on cold load (this provider + the coin-markets/global frames share one per-IP
// bucket) earns a 429. Prices are public market data — unlike the wallet's
// holdings, which stay out of storage (walletCache below) — so they get their own
// persisted, stale-on-error cache: one call feeds every wallet frame, a reload
// reuses the persisted prices with no network call, and a 429 serves the last
// good prices instead of failing the whole portfolio. 10 min TTL sits under the
// 60 s poll so background refreshes still land while reloads/extra frames reuse
// it. Keyed by the full id set (constant), not per-wallet, to maximise reuse.
const priceCache = new TtlCache<Record<string, PriceRow>>({
  namespace: "zframes:wallet:prices",
  ttlMs: 10 * 60_000,
  persist: true,
});

async function fetchPrices(): Promise<Record<string, PriceRow>> {
  return priceCache.get("all", async () => {
    const url = `${COINGECKO_PRICE}?ids=${ALL_CG_IDS.join(",")}&vs_currencies=usd&include_24hr_change=true`;
    const body = await fetchJson<Record<string, PriceRow>>(url);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("coingecko simple/price: unexpected response shape");
    return body;
  });
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// Per-address TTL + in-flight dedup across the value / allocation / holdings
// frames on one address. 2 min eases public-RPC pressure; the 60 s poll still
// refreshes in the background once the entry expires. Not persisted — holdings
// are wallet-specific, so they stay out of storage (prices, which are public,
// have their own persisted cache above).
const walletCache = new TtlCache<Portfolio>({
  namespace: "zframes:wallet:portfolio",
  ttlMs: 120_000,
  persist: false,
});

export class WalletProvider implements MarketDataProvider {
  readonly name = "On-chain wallet";
  readonly capabilities: readonly Capability[] = ["portfolio"];
  readonly portfolioKinds: readonly PortfolioSourceKind[] = ["wallet"];

  async getPortfolio(source: PortfolioSource): Promise<Portfolio> {
    if (source.kind !== "wallet" || !source.address)
      throw new Error("wallet provider needs a wallet source with an address");
    return walletCache.get(source.address, async () => {
      const address = await resolveAddress(source.address!);
      const amounts = await fetchBalances(address);
      const held = TOKENS.filter((t) => amounts.has(t.symbol));
      const prices = held.length ? await fetchPrices() : {};

      const holdings: Holding[] = held
        .map((token) => {
          const amount = amounts.get(token.symbol) ?? 0;
          const price = prices[token.cgId]?.usd;
          const valueUsd = price !== undefined ? amount * price : undefined;
          return {
            symbol: token.symbol,
            amount,
            valueUsd,
            changePct24h: prices[token.cgId]?.usd_24h_change,
          };
        })
        .filter((h) => h.valueUsd !== undefined && h.valueUsd >= DUST_USD)
        .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

      const totalUsd = holdings.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0);
      return {
        source: "wallet",
        label: shortAddress(address),
        holdings,
        totalUsd,
        asOf: Date.now(),
      };
    });
  }
}
