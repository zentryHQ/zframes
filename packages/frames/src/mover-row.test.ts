import { describe, expect, it } from "vitest";
import { splitMovers } from "./mover-row";

/**
 * The invariant the two-column movers frames need and did not have: a row
 * belongs to exactly one column. The old split (`slice(0, n)` against
 * `slice(-n).reverse()`) failed silently on any universe smaller than 2n — the
 * duplicated rows look like real data, so nothing in the card gives it away.
 */
describe("splitMovers", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("takes the top n and the bottom n on a large universe", () => {
    const { gainers, losers } = splitMovers(rows(100), 5);
    expect(gainers).toEqual([0, 1, 2, 3, 4]);
    // Worst first: the tail, reversed.
    expect(losers).toEqual([99, 98, 97, 96, 95]);
  });

  it("never serves the same row to both columns", () => {
    // Every universe size around and below 2 x count, which is where the
    // unclamped split overlapped.
    for (let size = 0; size <= 12; size += 1) {
      const { gainers, losers } = splitMovers(rows(size), 5);
      const shared = gainers.filter((row) => losers.includes(row));
      expect(shared, `size ${size} served ${shared.length} rows twice`).toEqual(
        [],
      );
      expect(gainers.length + losers.length).toBeLessThanOrEqual(size);
    }
  });

  it("drops nothing on a universe smaller than 2n", () => {
    const { gainers, losers } = splitMovers(rows(5), 5);
    expect(gainers).toEqual([0, 1, 2]);
    expect(losers).toEqual([4, 3]);
    expect([...gainers, ...losers].sort((a, b) => a - b)).toEqual(rows(5));
  });

  it("puts a two-row universe one on each side", () => {
    expect(splitMovers(rows(2), 5)).toEqual({ gainers: [0], losers: [1] });
  });

  it("leaves the losers column empty rather than mirroring one row", () => {
    // The worst case of the old split: one row, printed as both the day's best
    // and the day's worst.
    expect(splitMovers(rows(1), 5)).toEqual({ gainers: [0], losers: [] });
  });

  it("handles an empty universe and a non-positive count", () => {
    expect(splitMovers(rows(0), 5)).toEqual({ gainers: [], losers: [] });
    // `slice(-0)` is the whole array, so a zero count must not fall through.
    expect(splitMovers(rows(10), 0)).toEqual({ gainers: [], losers: [] });
  });
});
