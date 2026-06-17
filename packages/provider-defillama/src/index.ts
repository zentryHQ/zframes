import type { Capability, MarketDataProvider, TvlEntry } from "@zframes/core";
import { fetchJson } from "@zframes/core/fetch";

const CHAINS_URL = "https://api.llama.fi/v2/chains";

interface LlamaChain {
  name: string;
  tvl: number;
}

/**
 * Free, no-API-key provider backed by DeFiLlama's public API.
 * - tvl: total value locked per chain, sorted descending.
 */
export class DefiLlamaProvider implements MarketDataProvider {
  readonly name = "defillama";
  readonly capabilities: readonly Capability[] = ["tvl"];

  async getTvlByChain(): Promise<TvlEntry[]> {
    const chains = await fetchJson<LlamaChain[]>(CHAINS_URL);
    if (!Array.isArray(chains))
      throw new Error("defillama chains: unexpected response shape");
    return chains
      .filter((chain) => Number.isFinite(chain.tvl) && chain.tvl > 0)
      .sort((a, b) => b.tvl - a.tvl)
      .map((chain) => ({ name: chain.name, tvl: chain.tvl }));
  }
}
