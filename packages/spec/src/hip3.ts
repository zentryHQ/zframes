/**
 * The HIP-3 builder dexes whose whole universe zframes scans, in preference
 * order.
 *
 * A builder dex answers only for its own "<dex>:*" wildcard (a bare
 * `getDayStats()` call returns the crypto default dex alone), so a dex missing
 * from this list is invisible on every surface that scans a universe, and
 * nothing errors — while a typed "<dex>:SYMBOL" still resolves everywhere.
 *
 * Read by the editor's symbol picker, top movers, the funding leaderboard and
 * the journal's ticker picker, so those four cannot drift apart. The one
 * deliberate exception is the runtime's ticker tape, which stays on xyz alone;
 * its comment in `apps/runtime/src/ticker-tape.tsx` says why.
 *
 * Reached at the `@zframes/spec/hip3` subpath, never the root barrel: core
 * mirrors that barrel, so a value there would land on its public API.
 */
export const HIP3_DEXES: readonly string[] = ["xyz", "para"];

/** {@link HIP3_DEXES} as the "<dex>:*" wildcards a day-stats request takes. */
export const HIP3_DEX_WILDCARDS: readonly string[] = HIP3_DEXES.map(
  (dex) => `${dex}:*`,
);

/** Where a dex sorts: its index in {@link HIP3_DEXES}, an unlisted dex last. */
function dexRank(dex: string): number {
  const index = HIP3_DEXES.indexOf(dex);
  return index === -1 ? HIP3_DEXES.length : index;
}

/**
 * Keep one market per bare ticker when several HIP-3 dexes list the same name.
 *
 * A surface that labels a row by its ticker alone (the part after the colon)
 * would otherwise show two rows reading "AVGO" with nothing to tell them apart.
 * The dex listed earliest in {@link HIP3_DEXES} wins, a dex not in the list
 * loses to every listed one, and a tie between two unlisted dexes goes to the
 * lower symbol, so the result never depends on the input's order. Bare symbols
 * (the crypto default dex) are never touched, and the survivors keep their
 * input order. A surface that shows the full symbol does not need this.
 */
export function preferOneDexPerTicker<T>(
  bySymbol: Record<string, T>,
): Record<string, T> {
  const winners = new Map<string, { symbol: string; rank: number }>();
  for (const symbol of Object.keys(bySymbol)) {
    const colon = symbol.indexOf(":");
    if (colon === -1) continue;
    const ticker = symbol.slice(colon + 1);
    const rank = dexRank(symbol.slice(0, colon));
    const current = winners.get(ticker);
    if (
      !current ||
      rank < current.rank ||
      (rank === current.rank && symbol < current.symbol)
    )
      winners.set(ticker, { symbol, rank });
  }
  const out: Record<string, T> = {};
  for (const [symbol, value] of Object.entries(bySymbol)) {
    const colon = symbol.indexOf(":");
    if (colon === -1 || winners.get(symbol.slice(colon + 1))?.symbol === symbol)
      out[symbol] = value;
  }
  return out;
}
