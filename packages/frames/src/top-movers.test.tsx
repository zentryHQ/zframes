// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { FramesProvider } from "@zframes/core";
import type { DayStats, MarketDataProvider } from "@zframes/spec/types";
import { topMoversFrame } from "./top-movers";

// On Hyperliquid the movers board scans the HIP-3 builder dexes. Each one
// reaches it only through its own "<dex>:*" wildcard, so a dex the board never
// asks for can never place a gainer or a loser. A row is labelled by its bare
// ticker, so a name two dexes both list must still appear once.

afterEach(cleanup);

/** Two dexes that both list AVGO at different prices, plus a para-only name. */
const BY_DEX: Record<string, Record<string, DayStats>> = {
  "": {},
  xyz: { "xyz:AVGO": { markPx: 310.25, prevDayPx: 300, changePct: 3.42 } },
  para: {
    "para:AVGO": { markPx: 205.75, prevDayPx: 150, changePct: 37.17 },
    "para:TOTAL2": { markPx: 50.5, prevDayPx: 55, changePct: -8.18 },
  },
};

/** Answers like Hyperliquid: no symbols is the default dex, and a builder dex
 *  answers only for its own wildcard. Every request is recorded. */
function fakeProvider(requested: (string[] | undefined)[]): MarketDataProvider {
  return {
    name: "fake",
    capabilities: ["day-stats"],
    getDayStats: async (symbols?: string[]) => {
      requested.push(symbols);
      if (!symbols) return BY_DEX[""];
      const out: Record<string, DayStats> = {};
      for (const symbol of symbols) {
        if (symbol.endsWith(":*"))
          Object.assign(out, BY_DEX[symbol.slice(0, -2)] ?? {});
      }
      return out;
    },
  };
}

function renderMovers(requested: (string[] | undefined)[] = []) {
  const Frame = topMoversFrame.component;
  render(
    <FramesProvider providers={[fakeProvider(requested)]}>
      <Frame config={topMoversFrame.schema.parse({})} />
    </FramesProvider>,
  );
}

describe("top-movers", () => {
  it("asks for every HIP-3 dex's whole universe", async () => {
    const requested: (string[] | undefined)[] = [];
    renderMovers(requested);

    await waitFor(() =>
      expect(requested.flatMap((symbols) => symbols ?? [])).toEqual(
        expect.arrayContaining(["xyz:*", "para:*"]),
      ),
    );
  });

  it("lists a ticker two dexes share once, at xyz's price", async () => {
    renderMovers();

    expect(await screen.findByText("TOTAL2")).toBeTruthy();
    const avgo = screen.getAllByText("AVGO");
    expect(avgo).toHaveLength(1);
    expect(avgo[0].closest("[title]")?.getAttribute("title")).toBe(
      "AVGO · $310.25",
    );
  });
});
