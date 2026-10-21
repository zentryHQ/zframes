// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { FramesProvider } from "@zframes/core";
import type { DayStats, MarketDataProvider } from "@zframes/spec/types";
import { journalLogFrame } from "./journal-log";

// The journal's ticker picker offers every live Hyperliquid market. A HIP-3
// builder dex reaches it only through its own "<dex>:*" wildcard, so a dex the
// frame never asks for can't be picked, and a call on it can't be logged. A
// picker row shows the bare ticker, so a name two dexes list is offered once.

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

function renderJournal(requested: (string[] | undefined)[] = []) {
  const Frame = journalLogFrame.component;
  render(
    <FramesProvider providers={[fakeProvider(requested)]}>
      <Frame config={journalLogFrame.schema.parse({})} />
    </FramesProvider>,
  );
}

describe("journal-log", () => {
  it("asks for every HIP-3 dex's whole universe", async () => {
    const requested: (string[] | undefined)[] = [];
    renderJournal(requested);

    await waitFor(() =>
      expect(requested.flatMap((symbols) => symbols ?? [])).toEqual(
        expect.arrayContaining(["xyz:*", "para:*"]),
      ),
    );
  });

  it("offers a ticker two dexes share once, at xyz's price", async () => {
    renderJournal();
    // The picker opens from the selected-ticker button (the default, TSLA).
    fireEvent.click(screen.getByRole("button", { name: /TSLA/ }));

    expect(await screen.findByText("TOTAL2")).toBeTruthy();
    const avgo = screen.getAllByText("AVGO");
    expect(avgo).toHaveLength(1);
    const row = avgo[0].closest("button");
    expect(row).not.toBeNull();
    if (row) expect(within(row).getByText("$310.25")).toBeTruthy();
  });
});
