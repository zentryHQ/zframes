// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { z } from "zod";
import { createRegistry, defineFrame } from "@zframes/spec/frame";
import { DashboardSpecSchema } from "@zframes/spec/spec";
import type {
  Capability,
  FxRate,
  MarketDataProvider,
} from "@zframes/spec/types";
import { DashboardRenderer } from "./renderer";
import { FramesProvider } from "./hooks";
import { useMoney } from "./currency";
import { formatMoney } from "./money";

// FrameContent's *chrome* contract — the branches `frame-smoke` cannot see
// (its selector is `.zf-frame, .zf-bare`, so it passes whichever one renders)
// and that no real frame exercises:
//
//  1. FrameErrorBoundary. "Never crash the dashboard" is the renderer's headline
//     promise, but no shipped frame throws, so this branch has never executed in
//     a test. Pinned here on both card and bare paths: the fallback text, the
//     surviving chrome, and an untouched sibling on the same board.
//  2. chrome: "bare" — a positioned slot with NO card, no title row and no
//     source credit (the zone dividers: heading / divider / marquee). A bare
//     frame that silently grew chrome, or a card frame that lost it, is
//     invisible to a `.zf-frame, .zf-bare` smoke selector.
//  3. chrome: "plain" + the `showHeader` predicate at frame-content.tsx:747 —
//     each of its four terms (dynamic title / explicit title / icon / sources)
//     independently keeps the header row alive, and none of them means the row
//     is dropped entirely.
//  4. The titleContent footgun: an explicit `instance.title` beats BOTH the
//     frame label and the frame's own dynamic title (price-chart's live
//     ticker+price silently disappears when a title is set).
//  5. FrameCurrencyOverride is applied by FrameContent OUTSIDE the impl, so it
//     must wrap every branch — including the ones that never render the frame
//     component (bare frames, error cards). Asserted through the real currency
//     provider + `useMoney()`, not a reimplementation.
//
// Everything runs through the REAL DashboardRenderer + FrameContent so placement
// and per-frame style vars are exercised on the same path production uses.

/** A minimal provider — name + capability list is all the coverage check reads. */
function makeProvider(capabilities: Capability[]): MarketDataProvider {
  return { name: "test-provider", capabilities };
}

/** An fx provider answering from a fixed table, around a spy. */
function makeFx(table: Record<string, number>) {
  const getFxRates = vi.fn(
    async (base: string, symbols: string[]): Promise<FxRate[]> =>
      symbols
        .filter((s) => s in table)
        .map((s) => ({
          symbol: s,
          base,
          rate: table[s],
          changePct: 0,
          history: [],
        })),
  );
  const provider: MarketDataProvider = {
    name: "fx",
    capabilities: ["fx-rates"],
    getFxRates,
  };
  return { provider, getFxRates };
}

const BOOM = "quote stream returned nonsense";
const PRICE_USD = 20.66;

/** Renders the display currency its own subtree resolves to. */
function MoneyProbe({ tag }: { tag: string }) {
  const money = useMoney();
  return (
    <span
      data-testid={tag}
      data-code={money.code}
      data-price={money.price(PRICE_USD)}
    />
  );
}

// ── Synthetic frames, one per branch under test ──────────────────────────────

const crashFrame = defineFrame({
  name: "crash",
  label: "Crash",
  category: "tools",
  description: "throws while rendering",
  capabilities: [],
  schema: z.object({}),
  component: () => {
    throw new Error(BOOM);
  },
});

const bareCrashFrame = defineFrame({
  name: "bare-crash",
  label: "Bare Crash",
  category: "layout",
  description: "a chrome-less frame that throws while rendering",
  capabilities: [],
  chrome: "bare",
  schema: z.object({}),
  component: () => {
    throw new Error(BOOM);
  },
});

const markerFrame = defineFrame({
  name: "marker",
  label: "Marker",
  category: "tools",
  description: "renders a marker",
  capabilities: ["day-stats"],
  schema: z.object({ label: z.string().default("hi") }),
  component: ({ config }) => (
    <div data-testid="marker">MARKER:{String(config.label)}</div>
  ),
});

const bareFrame = defineFrame({
  name: "bare-zone",
  label: "Bare Zone",
  category: "layout",
  description: "a zone divider",
  capabilities: [],
  chrome: "bare",
  // Declared on purpose: a bare frame has no title row, so the credit must be
  // dropped rather than rendered loose in the zone.
  source: { name: "Zentry", url: "https://example.com/zentry" },
  schema: z.object({}),
  component: () => <div data-testid="bare-body">ZONE</div>,
});

const plainFrame = defineFrame({
  name: "plain-note",
  label: "Plain Note",
  category: "layout",
  description: "content frame whose body is its own heading",
  capabilities: [],
  chrome: "plain",
  schema: z.object({}),
  component: () => <div data-testid="plain-body">NOTE BODY</div>,
});

const plainSourcedFrame = defineFrame({
  name: "plain-sourced",
  label: "Plain Sourced",
  category: "layout",
  description: "plain chrome, but it credits two data sources",
  capabilities: [],
  chrome: "plain",
  source: [
    { name: "DeFiLlama", url: "https://defillama.com" },
    { name: "CoinGecko", url: "https://coingecko.com" },
  ],
  schema: z.object({}),
  component: () => <div data-testid="plain-sourced-body">rows</div>,
});

const tickerFrame = defineFrame({
  name: "ticker",
  label: "Ticker Label",
  category: "markets",
  description: "owns a dynamic title",
  capabilities: [],
  schema: z.object({ symbol: z.string().default("BTC") }),
  component: ({ config }) => (
    <div data-testid="ticker-body">{String(config.symbol)}</div>
  ),
  titleContent: ({ config }) => (
    <span data-testid="dynamic-title">{String(config.symbol)} 69,420</span>
  ),
});

const iconFrame = defineFrame({
  name: "icon-frame",
  label: "Icon Frame",
  category: "markets",
  description: "carries a leading title icon",
  capabilities: [],
  schema: z.object({}),
  component: () => <div data-testid="icon-body">body</div>,
  titleIcon: () => <img data-testid="title-icon" alt="" src="/logo.png" />,
});

const cardMoneyFrame = defineFrame({
  name: "card-money",
  label: "Card Money",
  category: "markets",
  description: "a normal card that renders money",
  capabilities: [],
  schema: z.object({}),
  component: () => <MoneyProbe tag="card-money" />,
});

const bareMoneyFrame = defineFrame({
  name: "bare-money",
  label: "Bare Money",
  category: "layout",
  description: "a chrome-less frame that renders money",
  capabilities: [],
  chrome: "bare",
  schema: z.object({}),
  component: () => <MoneyProbe tag="bare-money" />,
});

const registry = createRegistry([
  crashFrame,
  bareCrashFrame,
  markerFrame,
  bareFrame,
  plainFrame,
  plainSourcedFrame,
  tickerFrame,
  iconFrame,
  cardMoneyFrame,
  bareMoneyFrame,
]);

interface InstanceOverrides {
  config?: Record<string, unknown>;
  position?: { x: number; y: number; w: number; h: number };
  title?: string;
  currency?: string;
  style?: Record<string, number>;
}

const inst = (frame: string, over: InstanceOverrides = {}) => ({
  id: `${frame}-1`,
  frame,
  position: { x: 0, y: 0, w: 2, h: 2 },
  config: {},
  ...over,
});

/** Render a board through the real renderer (the production FrameContent path). */
function renderBoard(
  frames: Array<Record<string, unknown>>,
  {
    providers = [makeProvider(["day-stats"])],
    currency,
  }: { providers?: MarketDataProvider[]; currency?: string } = {},
) {
  const spec = DashboardSpecSchema.parse({
    title: "t",
    grid: {
      mode: "flow-vertical",
      columns: 6,
      rowHeight: 80,
      gap: 10,
      rows: 4,
    },
    ...(currency ? { currency: { code: currency } } : {}),
    frames,
  });
  return render(
    <FramesProvider providers={providers}>
      <DashboardRenderer spec={spec} registry={registry} />
    </FramesProvider>,
  );
}

function el(container: HTMLElement, selector: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`expected to find ${selector}`);
  return found;
}

function readProbe(container: HTMLElement, tag: string) {
  const node = el(container, `[data-testid="${tag}"]`);
  return { code: node.dataset.code ?? "", price: node.dataset.price ?? "" };
}

/** Flush a provider promise + the state update it triggers, inside act. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => cleanup());

describe("FrameErrorBoundary — a frame that throws mid-render", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // React logs every boundary-caught error; the rendered fallback is what is
    // under test, not the log noise.
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("shows the crash fallback in the card body, keeps the chrome, and spares its sibling", () => {
    const { container } = renderBoard([
      inst("crash"),
      inst("marker", { config: { label: "alive" } }),
    ]);

    // Exactly one error state on the board, and it is the crash one.
    expect(
      [...container.querySelectorAll(".zf-error-headline")].map(
        (n) => n.textContent,
      ),
    ).toEqual(["Frame crashed"]);
    // The thrown message is surfaced verbatim (the debugging surface).
    expect(el(container, ".zf-error-detail").textContent).toBe(BOOM);

    // The fallback sits inside the body of the card the frame already had …
    const stack = el(container, ".zf-frame-body > .zf-error");
    const card = stack.closest(".zf-frame") as HTMLElement;
    expect(card).not.toBeNull();
    // … so the card chrome — including its title row — survived the crash.
    expect(card.querySelector(".zf-frame-title")).not.toBeNull();
    expect(el(card, ".zf-frame-title-text").textContent).toBe("Crash");

    // KNOWN BUG: a crashed card keeps the plain (non-error) card chrome —
    // should also carry `zf-frame--error`, which is what paints the red rim +
    // top-bloom that FRAME_CSS's own comment says "unknown frame / missing
    // capability / invalid config / runtime crash all share". The boundary
    // renders inside the body, below the element that owns the class, so it
    // cannot add it. Pinned so the suite stays green; fixing the source must
    // flip this assertion.
    expect(card.classList.contains("zf-frame--error")).toBe(false);

    // The other frame on the same board rendered normally.
    expect(el(container, '[data-testid="marker"]').textContent).toBe(
      "MARKER:alive",
    );
    expect(container.querySelectorAll(".zf-frame")).toHaveLength(2);
  });

  it("contains a crash in a bare frame too (no card to fall back into)", () => {
    const { container } = renderBoard([
      inst("bare-crash"),
      inst("marker", { config: { label: "alive" } }),
    ]);

    const bare = el(container, ".zf-bare");
    expect(el(bare, ".zf-error-headline").textContent).toBe("Frame crashed");
    expect(el(bare, ".zf-error-detail").textContent).toBe(BOOM);
    // Still chrome-less: the crash didn't conjure a card around the zone.
    expect(bare.querySelector(".zf-frame-title")).toBeNull();
    expect(el(container, '[data-testid="marker"]').textContent).toBe(
      "MARKER:alive",
    );
  });
});

describe('chrome: "bare"', () => {
  it("renders a positioned slot with no card, no title row and no source credit", () => {
    const { container } = renderBoard([
      inst("bare-zone", {
        position: { x: 2, y: 1, w: 3, h: 2 },
        style: { accentHue: 320, accentSat: 95 },
      }),
    ]);

    const bare = el(container, ".zf-bare");
    expect(el(bare, '[data-testid="bare-body"]').textContent).toBe("ZONE");
    // Nothing but the frame's own content — no auto-title, no credit, no card.
    expect(bare.textContent).toBe("ZONE");
    expect(container.querySelector(".zf-frame")).toBeNull();
    expect(container.querySelector(".zf-frame-title")).toBeNull();
    expect(container.querySelector(".zf-frame-body")).toBeNull();
    expect(container.querySelector(".zf-frame-source")).toBeNull();

    // Placement still lands on the bare wrapper (1-based grid lines) …
    expect(bare.style.getPropertyValue("--zf-col-start")).toBe("3");
    expect(bare.style.getPropertyValue("--zf-col-span")).toBe("3");
    expect(bare.style.getPropertyValue("--zf-row-start")).toBe("2");
    expect(bare.style.getPropertyValue("--zf-row-span")).toBe("2");
    // … as do this instance's cosmetic overrides (how a heading gets its own
    // accent, since .zf-bare re-derives the accent tokens from these).
    expect(bare.style.getPropertyValue("--zf-accent-hue")).toBe("320");
    expect(bare.style.getPropertyValue("--zf-accent-sat")).toBe("95%");
  });

  it("ignores an explicit instance title — a bare frame has nowhere to put one", () => {
    const { container } = renderBoard([inst("bare-zone", { title: "Zone A" })]);

    expect(container.querySelector(".zf-bare")).not.toBeNull();
    expect(container.querySelector(".zf-frame-title")).toBeNull();
    expect(el(container, ".zf-bare").textContent).toBe("ZONE");
    expect(el(container, ".zf-bare").textContent).not.toContain("Zone A");
  });
});

describe('chrome: "plain" and the showHeader predicate', () => {
  it("drops the header row entirely when nothing would fill it", () => {
    const { container } = renderBoard([inst("plain-note")]);

    // The card surface stays (this is not a bare frame) …
    const card = el(container, ".zf-frame");
    expect(
      el(card, ".zf-frame-body [data-testid='plain-body']"),
    ).not.toBeNull();
    // … but there is no title row at all, so the body gets the whole card
    // instead of an empty title bar and its bottom margin.
    expect(container.querySelector(".zf-frame-title")).toBeNull();
    expect(container.querySelector(".zf-frame-title-text")).toBeNull();
    expect(card.textContent).toBe("NOTE BODY");
    // The auto-title (def.label) is suppressed, not merely hidden.
    expect(container.textContent).not.toContain("Plain Note");
  });

  it("brings the header back for an explicit instance title", () => {
    const { container } = renderBoard([
      inst("plain-note", { title: "My Note" }),
    ]);

    const row = el(container, ".zf-frame-title");
    expect(el(row, ".zf-frame-title-text").textContent).toBe("My Note");
    expect(row.classList.contains("zf-frame-title--icon")).toBe(false);
    expect(container.textContent).not.toContain("Plain Note");
  });

  it("keeps the header for a source credit alone, with an empty title slot", () => {
    const { container } = renderBoard([inst("plain-sourced")]);

    expect(container.querySelector(".zf-frame-title")).not.toBeNull();
    // sources.length alone satisfied showHeader — the auto-title is still gone.
    expect(el(container, ".zf-frame-title-text").textContent).toBe("");
    expect(container.textContent).not.toContain("Plain Sourced");

    // A declared source array renders in order, each link opening safely, with
    // a separator only *between* entries.
    const links = [...container.querySelectorAll(".zf-frame-source a")];
    expect(links.map((a) => a.textContent)).toEqual(["DeFiLlama", "CoinGecko"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://defillama.com",
      "https://coingecko.com",
    ]);
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toBe("noreferrer noopener");
    expect(container.querySelectorAll(".zf-frame-source-sep")).toHaveLength(1);
  });

  it('"card" chrome (the default) auto-titles from the frame label', () => {
    const { container } = renderBoard([inst("marker")]);

    expect(el(container, ".zf-frame-title-text").textContent).toBe("Marker");
    // No source declared on this frame → no credit, but the row still shows.
    expect(container.querySelector(".zf-frame-source")).toBeNull();
  });
});

describe("dynamic title (titleContent) vs an explicit instance title", () => {
  it("renders the frame's own dynamic title in the title slot when the instance sets none", () => {
    const { container } = renderBoard([
      inst("ticker", { config: { symbol: "TSLA" } }),
    ]);

    const slot = el(container, ".zf-frame-title-text");
    expect(slot.querySelector('[data-testid="dynamic-title"]')).not.toBeNull();
    // It receives the parsed config and REPLACES the static label.
    expect(slot.textContent).toBe("TSLA 69,420");
    expect(container.textContent).not.toContain("Ticker Label");
  });

  it("lets an explicit title beat both the label and the dynamic title", () => {
    const { container } = renderBoard([
      inst("ticker", { config: { symbol: "TSLA" }, title: "Tesla" }),
    ]);

    expect(el(container, ".zf-frame-title-text").textContent).toBe("Tesla");
    // The footgun: setting a title silently hides the frame's live ticker+price.
    expect(container.querySelector('[data-testid="dynamic-title"]')).toBeNull();
    expect(container.textContent).not.toContain("69,420");
    expect(container.textContent).not.toContain("Ticker Label");
    // The frame body itself is unaffected.
    expect(el(container, '[data-testid="ticker-body"]').textContent).toBe(
      "TSLA",
    );
  });

  it("drops the whole header for an EMPTY explicit title, dynamic title included", () => {
    const { container } = renderBoard([
      inst("ticker", { config: { symbol: "TSLA" }, title: "" }),
    ]);

    // `titleContent` is gated on `instance.title == null`, so "" still counts as
    // set and suppresses it — while showHeader is truthiness-based, so ""
    // removes the row as well. Net effect: a titled-empty card has no header.
    expect(container.querySelector(".zf-frame-title")).toBeNull();
    expect(container.querySelector('[data-testid="dynamic-title"]')).toBeNull();
    expect(el(container, ".zf-frame").textContent).toBe("TSLA");
  });
});

describe("titleIcon", () => {
  it("renders the icon ahead of the title text and flags the row so the dot drops", () => {
    const { container } = renderBoard([inst("icon-frame")]);

    const row = el(container, ".zf-frame-title");
    // The modifier class is what hides .zf-frame-title::before (the status dot).
    expect(row.classList.contains("zf-frame-title--icon")).toBe(true);
    const icon = el(container, '[data-testid="title-icon"]');
    expect(row.firstElementChild).toBe(icon);
    expect(el(row, ".zf-frame-title-text").textContent).toBe("Icon Frame");
  });

  it("leaves the modifier class off a frame with no icon", () => {
    const { container } = renderBoard([inst("marker")]);

    expect(
      el(container, ".zf-frame-title").classList.contains(
        "zf-frame-title--icon",
      ),
    ).toBe(false);
    expect(container.querySelector('[data-testid="title-icon"]')).toBeNull();
  });
});

describe("FrameCurrencyOverride reaches every FrameContent branch", () => {
  it("applies a per-card currency to a BARE frame (no card, no ValidFrameCard)", async () => {
    const RATE = 36.5;
    const { provider, getFxRates } = makeFx({ THB: RATE });

    const { container } = renderBoard(
      [inst("bare-money", { currency: "THB" })],
      { providers: [provider] },
    );
    await waitFor(() =>
      expect(readProbe(container, "bare-money").code).toBe("THB"),
    );

    // The override asked for its own code and the money kernel converted.
    expect(getFxRates).toHaveBeenCalledWith("USD", ["THB"]);
    expect(readProbe(container, "bare-money").price).toBe(
      formatMoney(PRICE_USD * RATE, "THB"),
    );
    // Still the chrome-less branch — the currency wrapper added no card.
    expect(container.querySelector(".zf-bare")).not.toBeNull();
    expect(container.querySelector(".zf-frame")).toBeNull();
  });

  it("applies a per-card currency to an ERROR-CARD frame, whose component never runs", async () => {
    const { provider, getFxRates } = makeFx({ THB: 36.5 });

    const { container } = renderBoard(
      [inst("does-not-exist", { currency: "THB" })],
      { providers: [provider] },
    );

    // This really is the pre-render error branch …
    expect(el(container, ".zf-error-headline").textContent).toBe(
      "Unknown frame",
    );
    expect(container.querySelector("[data-testid]")).toBeNull();
    // … and the card's own currency still resolved: FrameContent wraps the
    // override OUTSIDE the impl, so every early return is covered. Were it
    // inside the happy path, only the board's own empty-symbol poll would fire.
    expect(getFxRates.mock.calls).toContainEqual(["USD", ["THB"]]);

    await settle();
  });

  it("leaves an un-overridden card on the board currency, and overrides only its own card", async () => {
    const EUR_RATE = 0.92;
    const { provider, getFxRates } = makeFx({ EUR: EUR_RATE, THB: 36.5 });

    const { container } = renderBoard(
      [
        inst("card-money"),
        inst("bare-money", {
          currency: "USD",
          position: { x: 2, y: 0, w: 2, h: 2 },
        }),
      ],
      { providers: [provider], currency: "EUR" },
    );
    await waitFor(() =>
      expect(readProbe(container, "card-money").code).toBe("EUR"),
    );

    // The card with no `currency` inherits the board's — one shared poll.
    expect(getFxRates).toHaveBeenCalledWith("USD", ["EUR"]);
    expect(readProbe(container, "card-money").price).toBe(
      formatMoney(PRICE_USD * EUR_RATE, "EUR"),
    );
    // The card that pinned USD stays in dollars beside it — the documented
    // "keep one card in USD on a non-USD board" case.
    expect(readProbe(container, "bare-money")).toEqual({
      code: "USD",
      price: formatMoney(PRICE_USD, "USD"),
    });
    // Nothing asked for the unrelated table entry.
    expect(getFxRates).not.toHaveBeenCalledWith("USD", ["THB"]);
  });
});
