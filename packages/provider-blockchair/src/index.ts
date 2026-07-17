import type {
  Capability,
  ChainActivity,
  MarketDataProvider,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

const BASE_URL = "https://api.blockchair.com";

// Major L1s with a uniform /stats shape (24h tx count, blocks, mempool, price).
// Blockchair's keyless tier allows a modest burst, so the set is fetched in
// parallel; a chain whose call fails or lacks the fields is skipped, so one
// flaky endpoint degrades the board instead of emptying it.
const CHAINS: readonly { slug: string; label: string }[] = [
  { slug: "bitcoin", label: "Bitcoin" },
  { slug: "ethereum", label: "Ethereum" },
  { slug: "litecoin", label: "Litecoin" },
  { slug: "dogecoin", label: "Dogecoin" },
  { slug: "bitcoin-cash", label: "Bitcoin Cash" },
  { slug: "dash", label: "Dash" },
  { slug: "zcash", label: "Zcash" },
];

// Per-chain stats move each block, but a cross-chain board doesn't need
// sub-minute freshness. A 4-min TTL (under useChainActivity's ~5 min poll) keeps
// the fan-out of ~7 calls rare, dedups concurrent frames, persists across
// reloads, and serves the last good board on a transient error.
const chainCache = new TtlCache<ChainActivity[]>({
  namespace: "zframes:blockchair:chains",
  ttlMs: 4 * 60_000,
  persist: true,
});

/** Coerce a maybe-missing/NaN numeric to a finite fallback. */
function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

interface BlockchairStats {
  data?: {
    transactions_24h?: number;
    blocks_24h?: number;
    mempool_transactions?: number;
    market_price_usd?: number;
    market_price_usd_change_24h_percentage?: number;
  };
}

/**
 * Free, no-API-key provider backed by Blockchair's public per-chain /stats.
 * - chain-activity: cross-chain network activity for major L1s (24h transaction
 *   count, blocks mined, mempool size, native price + 24h change), sorted by
 *   24h transaction count.
 */
export class BlockchairProvider implements MarketDataProvider {
  readonly name = "blockchair";
  readonly capabilities: readonly Capability[] = ["chain-activity"];

  async getChainActivity(): Promise<ChainActivity[]> {
    return chainCache.get("chains", async () => {
      const settled = await Promise.allSettled(
        CHAINS.map(async ({ slug, label }) => {
          const body = await fetchJson<BlockchairStats>(
            `${BASE_URL}/${slug}/stats`,
          );
          const d = body?.data;
          if (!d || !Number.isFinite(Number(d.transactions_24h)))
            throw new Error(`blockchair ${slug}: unexpected response shape`);
          return {
            chain: slug,
            label,
            transactions24h: num(d.transactions_24h),
            blocks24h: num(d.blocks_24h),
            mempoolTxns: num(d.mempool_transactions),
            priceUsd: num(d.market_price_usd),
            priceChangePct24h: num(d.market_price_usd_change_24h_percentage),
          } satisfies ChainActivity;
        }),
      );
      const chains = settled
        .filter(
          (r): r is PromiseFulfilledResult<ChainActivity> =>
            r.status === "fulfilled",
        )
        .map((r) => r.value);
      if (chains.length === 0)
        throw new Error("blockchair: no chains resolved");
      return chains.sort((a, b) => b.transactions24h - a.transactions24h);
    });
  }
}
