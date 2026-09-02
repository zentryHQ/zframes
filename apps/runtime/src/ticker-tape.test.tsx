// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { FramesProvider } from "@zframes/core";
import type { MarketDataProvider } from "@zframes/core";
import { TickerTape } from "./ticker-tape";

// The tape is the most expensive always-on chrome on the page: it mounts its
// whole symbol track TWICE (the marquee's -50% loop needs the duplicate),
// subscribes to the live mids socket, and sweeps every node on an interval.
// What's pinned here is that a low-end device gets the short static strip
// instead — the gate the animated backdrop already consults, which the tape
// used never to ask.

const { lowEnd } = vi.hoisted(() => ({ lowEnd: { value: false } }));
vi.mock("@zframes/unicorn", () => ({ useLowEndDevice: () => lowEnd.value }));

/** 60 crypto symbols, so the low-end cap (40) is observably below the full set. */
const CRYPTO = Array.from({ length: 60 }, (_, i) => `C${i}`);
const EQUITIES = ["xyz:TSLA", "xyz:AAPL"];

const stats = (symbols: readonly string[]) =>
  Object.fromEntries(
    symbols.map((sym) => [sym, { markPx: 10, prevDayPx: 9, changePct: 1.5 }]),
  );

/** A day-stats-only provider: the wildcard call gets the equity dex, the
 *  undefined call gets the crypto universe, exactly as the tape asks. */
const provider = {
  name: "fake",
  capabilities: ["day-stats"],
  getDayStats: async (symbols?: readonly string[]) =>
    stats(symbols?.length ? EQUITIES : CRYPTO),
} as unknown as MarketDataProvider;

const items = () => document.querySelectorAll(".zf-tape-item").length;
const bar = () => screen.getByLabelText("live ticker tape");

beforeEach(() => {
  lowEnd.value = false;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function mountTape() {
  render(
    <FramesProvider providers={[provider]}>
      <TickerTape />
    </FramesProvider>,
  );
  await waitFor(() => expect(items()).toBeGreaterThan(0));
}

describe("the ticker tape's low-end-device gate", () => {
  it("runs the full duplicated marquee on a capable device", async () => {
    await mountTape();
    // Both tracks, so the CSS loop has its seamless second copy.
    expect(items()).toBe((EQUITIES.length + CRYPTO.length) * 2);
    expect(bar().className).not.toContain("zf-tape-static");
    expect(
      document.querySelector<HTMLElement>(".zf-tape-track")?.style
        .animationDuration,
    ).not.toBe("");
  });

  it("renders one short static strip on a low-end device", async () => {
    lowEnd.value = true;
    await mountTape();
    // Capped AND undoubled: 40 nodes instead of ~124, with no animation to
    // repaint. The strip stays finger-scrollable, so it's still readable.
    expect(items()).toBe(40);
    expect(bar().className).toContain("zf-tape-static");
    expect(
      document.querySelector<HTMLElement>(".zf-tape-track")?.style
        .animationDuration,
    ).toBe("");
  });
});
