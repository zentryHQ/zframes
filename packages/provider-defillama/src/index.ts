import type { Capability, MarketDataProvider, TvlEntry } from "@zframes/core";

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
    const res = await fetch(CHAINS_URL);
    if (!res.ok) throw new Error(`defillama chains failed: ${res.status}`);
    const chains = (await res.json()) as LlamaChain[];
    return chains
      .filter((chain) => chain.tvl > 0)
      .sort((a, b) => b.tvl - a.tvl)
      .map((chain) => ({ name: chain.name, tvl: chain.tvl }));
  }
}
