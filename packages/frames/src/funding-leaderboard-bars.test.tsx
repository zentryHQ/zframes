// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { FramesProvider } from "@zframes/core";
import type { DayStats, MarketDataProvider } from "@zframes/spec/types";
import { fundingLeaderboardBarsFrame } from "./funding-leaderboard-bars";

// The leaderboard ranks the whole Hyperliquid perp book. A HIP-3 builder dex
// reaches it only through its own "<dex>:*" wildcard, so a dex the board never
// asks for is silently missing from the ranking. A bar is labelled by its bare
// ticker, so a name two dexes both list must still get one bar.

beforeEach(() => {
  // jsdom measures everything as 0×0 and the bar chart draws nothing without a
  // box; `observeResize` also needs a ResizeObserver to exist at all.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    top: 0,
    left: 0,
    right: 400,
    bottom: 300,
    toJSON: () => ({}),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Two dexes that both list AVGO at different funding, plus a para-only name. */
const BY_DEX: Record<string, Record<string, DayStats>> = {
  "": {},
  xyz: {
    "xyz:AVGO": {
      markPx: 310.25,
      prevDayPx: 300,
      changePct: 3.42,
      funding: 0.0001,
    },
  },
  para: {
    "para:AVGO": {
      markPx: 205.75,
      prevDayPx: 150,
      changePct: 37.17,
      funding: 0.0005,
    },
    "para:TOTAL2": {
      markPx: 50.5,
      prevDayPx: 55,
      changePct: -8.18,
      funding: -0.0002,
    },
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

function renderBoard(requested: (string[] | undefined)[] = []) {
  const Frame = fundingLeaderboardBarsFrame.component;
  return render(
    <FramesProvider providers={[fakeProvider(requested)]}>
      <Frame config={fundingLeaderboardBarsFrame.schema.parse({})} />
    </FramesProvider>,
  );
}

/** Each bar row's accessible "label: value" text, in drawn order. */
const barLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[aria-label]"), (el) =>
    el.getAttribute("aria-label"),
  );

describe("funding-leaderboard-bars", () => {
  it("asks for every HIP-3 dex's whole universe", async () => {
    const requested: (string[] | undefined)[] = [];
    renderBoard(requested);

    await waitFor(() =>
      expect(requested.flatMap((symbols) => symbols ?? [])).toEqual(
        expect.arrayContaining(["xyz:*", "para:*"]),
      ),
    );
  });

  it("charts a ticker two dexes share once, at xyz's funding", async () => {
    const { container } = renderBoard();

    await waitFor(() =>
      expect(barLabels(container)).toContain("TOTAL2: -0.0200%"),
    );
    expect(
      barLabels(container).filter((label) => label?.startsWith("AVGO:")),
    ).toEqual(["AVGO: +0.0100%"]);
  });
});
