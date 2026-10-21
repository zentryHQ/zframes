import { describe, expect, it } from "vitest";
import { preferOneDexPerTicker } from "./hip3";

// The boards label a HIP-3 row by its ticker alone, so two dexes listing the
// same name would print two identical rows. These pin which one survives.

describe("preferOneDexPerTicker", () => {
  it("keeps xyz's market when para lists the same ticker", () => {
    expect(preferOneDexPerTicker({ "para:AVGO": 2, "xyz:AVGO": 1 })).toEqual({
      "xyz:AVGO": 1,
    });
  });

  it("keeps a ticker that only para lists", () => {
    expect(preferOneDexPerTicker({ "xyz:TSLA": 1, "para:TOTAL2": 2 })).toEqual({
      "xyz:TSLA": 1,
      "para:TOTAL2": 2,
    });
  });

  it("never touches a bare symbol, even when a namespaced one shares its name", () => {
    expect(
      preferOneDexPerTicker({ AVGO: 0, "para:AVGO": 2, "xyz:AVGO": 1, BTC: 3 }),
    ).toEqual({ AVGO: 0, "xyz:AVGO": 1, BTC: 3 });
  });

  it("lets a listed dex beat one that is not in the list", () => {
    expect(preferOneDexPerTicker({ "km:AVGO": 9, "para:AVGO": 2 })).toEqual({
      "para:AVGO": 2,
    });
  });

  it("picks the same winners whatever the input order", () => {
    const entries: [string, number][] = [
      ["km:GOLD", 9],
      ["flx:GOLD", 8],
      ["para:AVGO", 2],
      ["xyz:AVGO", 1],
    ];
    const forward = preferOneDexPerTicker(Object.fromEntries(entries));
    const reverse = preferOneDexPerTicker(
      Object.fromEntries([...entries].reverse()),
    );
    expect(forward).toEqual({ "flx:GOLD": 8, "xyz:AVGO": 1 });
    expect(reverse).toEqual({ "flx:GOLD": 8, "xyz:AVGO": 1 });
  });
});
