// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { z } from "zod";
import { DashboardRenderer } from "./renderer";
import { createRegistry, defineFrame } from "@zframes/spec/frame";
import { DashboardSpecSchema, FONT_FAMILY_STACKS } from "@zframes/spec/spec";
import { FramesProvider } from "./hooks";
import type { Capability, MarketDataProvider } from "@zframes/spec/types";

// The renderer's contract is "never crash the dashboard": every failure mode
// (unknown frame, uncovered capability, invalid config, a render throw) resolves
// to a contained, self-explaining error card, and a healthy frame renders its
// own content. It also owns spec → CSS-var translation (cosmetics + placement).
// These tests assert that contract on the REAL DashboardRenderer + FrameContent,
// with exact card text/classes and exact --zf-* values.

// A minimal provider — the interface's data methods are all optional, so a name
// + a capability list is enough to drive the renderer's coverage check.
function makeProvider(capabilities: Capability[]): MarketDataProvider {
  return { name: "test-provider", capabilities };
}

// Three synthetic frames spanning the paths under test; a marker component makes
// "did the real component render?" observable.
const markerFrame = defineFrame({
  name: "marker",
  label: "Marker",
  category: "tools",
  description: "renders a marker",
  capabilities: ["day-stats"],
  schema: z.object({ label: z.string().default("hi") }),
  component: ({ config }) => (
    <div data-testid="marker">MARKER:{config.label as string}</div>
  ),
});

const newsFrame = defineFrame({
  name: "news-frame",
  label: "News",
  category: "sentiment",
  description: "needs the news capability",
  capabilities: ["news"],
  schema: z.object({}),
  component: () => <div data-testid="news">news</div>,
});

const strictFrame = defineFrame({
  name: "strict",
  label: "Strict",
  category: "tools",
  description: "requires a 3+ char ticker",
  capabilities: ["day-stats"],
  schema: z.object({ ticker: z.string().min(3) }),
  component: ({ config }) => <div data-testid="strict">{config.ticker}</div>,
});

const registry = createRegistry([markerFrame, newsFrame, strictFrame]);

/** Render a one-or-more-frame dashboard through the real renderer. */
function renderDashboard(
  frames: Array<Record<string, unknown>>,
  {
    capabilities = ["day-stats"] as Capability[],
    grid = {
      mode: "flow-vertical",
      columns: 6,
      rowHeight: 80,
      gap: 10,
      rows: 4,
    },
    theme,
    appearance,
    typography,
  }: {
    capabilities?: Capability[];
    grid?: Record<string, unknown>;
    theme?: Record<string, unknown>;
    appearance?: Record<string, unknown>;
    typography?: Record<string, unknown>;
  } = {},
) {
  const spec = DashboardSpecSchema.parse({
    title: "t",
    grid,
    ...(theme ? { theme } : {}),
    ...(appearance ? { appearance } : {}),
    ...(typography ? { typography } : {}),
    frames,
  });
  return render(
    <FramesProvider providers={[makeProvider(capabilities)]}>
      <DashboardRenderer spec={spec} registry={registry} />
    </FramesProvider>,
  );
}

const inst = (
  frame: string,
  config: Record<string, unknown> = {},
  position = { x: 0, y: 0, w: 2, h: 2 },
) => ({ id: `${frame}-1`, frame, position, config });

afterEach(() => cleanup());

describe("DashboardRenderer error-card contract", () => {
  it("renders an unknown-frame card that names the frame and lists what is registered", () => {
    const { container } = renderDashboard([inst("does-not-exist")]);

    const card = container.querySelector(".zf-frame--error");
    expect(card).not.toBeNull();
    expect(container.querySelector(".zf-error-headline")?.textContent).toBe(
      "Unknown frame",
    );
    // The unresolved name is surfaced (the agent's feedback loop) …
    expect(container.querySelector(".zf-error-detail")?.textContent).toContain(
      "does-not-exist",
    );
    // … alongside the registered names it could have meant.
    const list = container.querySelector(".zf-error-list")?.textContent ?? "";
    expect(list).toContain("marker");
    expect(list).toContain("strict");
    // Never rendered the (absent) component.
    expect(container.querySelector("[data-testid]")).toBeNull();
  });

  it("renders a missing-capability card naming the uncovered capability", () => {
    // Provider covers day-stats but the frame needs news.
    const { container } = renderDashboard([inst("news-frame")], {
      capabilities: ["day-stats"],
    });

    expect(container.querySelector(".zf-frame--error")).not.toBeNull();
    expect(container.querySelector(".zf-error-headline")?.textContent).toBe(
      "No data source",
    );
    expect(container.querySelector(".zf-error-detail")?.textContent).toContain(
      "news",
    );
    expect(container.querySelector('[data-testid="news"]')).toBeNull();
  });

  it("covers the capability but still errors when config fails the frame schema", () => {
    // "ab" < the min length of 3 → the ticker field fails validation.
    const { container } = renderDashboard([inst("strict", { ticker: "ab" })]);

    expect(container.querySelector(".zf-frame--error")).not.toBeNull();
    expect(container.querySelector(".zf-error-headline")?.textContent).toBe(
      "Invalid configuration",
    );
    // The offending field path is surfaced as a code chip.
    const fields = [...container.querySelectorAll(".zf-error-field")].map(
      (el) => el.textContent,
    );
    expect(fields).toContain("ticker");
    expect(container.querySelector('[data-testid="strict"]')).toBeNull();
  });

  it("renders the component (no error card) for a valid frame + capable provider", () => {
    const { container } = renderDashboard([inst("marker", { label: "ok" })]);

    expect(container.querySelector(".zf-frame--error")).toBeNull();
    const marker = container.querySelector('[data-testid="marker"]');
    expect(marker).not.toBeNull();
    expect(marker?.textContent).toBe("MARKER:ok");
    // …inside a real card, not a bare zone.
    expect(container.querySelector(".zf-frame")).not.toBeNull();
  });
});

describe("DashboardRenderer spec → CSS custom properties", () => {
  it("maps theme / appearance / typography onto --zf-* vars on the grid host", () => {
    const { container } = renderDashboard([inst("marker")], {
      theme: {
        accentHue: 300,
        accentSat: 80,
        baseHue: 210,
        baseSat: 40,
        upColor: "#112233",
        downColor: "#445566",
      },
      appearance: {
        radius: 24,
        borderStrength: 0.5,
        surfaceOpacity: 0.8,
        density: 1.2,
        elevation: 2,
      },
      typography: { fontFamily: "mono", numericStyle: "tabular", scale: 1 },
    });

    const grid = container.querySelector(".zf-grid") as HTMLElement;
    expect(grid).not.toBeNull();
    const v = (name: string) => grid.style.getPropertyValue(name);

    // Colour identity — hue is bare, saturation carries the % unit.
    expect(v("--zf-accent-hue")).toBe("300");
    expect(v("--zf-accent-sat")).toBe("80%");
    expect(v("--zf-base-hue")).toBe("210");
    expect(v("--zf-base-sat")).toBe("40%");
    // Semantic gain/loss pair passes through verbatim.
    expect(v("--zf-up")).toBe("#112233");
    expect(v("--zf-down")).toBe("#445566");
    // Typography routes through the family stack + numeric-variant maps.
    expect(v("--zf-font-family")).toBe(FONT_FAMILY_STACKS.mono);
    expect(v("--zf-numeric")).toBe("tabular-nums");
    // Card-surface knobs — radius gains px, the rest are unitless scalars.
    expect(v("--zf-frame-radius")).toBe("24px");
    expect(v("--zf-border-alpha")).toBe("0.5");
    expect(v("--zf-surface-opacity")).toBe("0.8");
    expect(v("--zf-density")).toBe("1.2");
    expect(v("--zf-elevation")).toBe("2");
  });

  it("maps grid geometry onto the host and frame placement onto the card", () => {
    const { container } = renderDashboard(
      [inst("marker", { label: "x" }, { x: 2, y: 1, w: 3, h: 2 })],
      {
        grid: {
          mode: "flow-vertical",
          columns: 6,
          rowHeight: 80,
          gap: 10,
          rows: 4,
        },
      },
    );

    const grid = container.querySelector(".zf-grid") as HTMLElement;
    expect(grid.style.getPropertyValue("--zf-cols")).toBe("6");
    expect(grid.style.getPropertyValue("--zf-row-h")).toBe("80px");
    expect(grid.style.getPropertyValue("--zf-gap")).toBe("10px");

    // Placement ships as 1-based grid lines: col-start = x+1, row-start = y+1.
    const card = container.querySelector(".zf-frame") as HTMLElement;
    expect(card.style.getPropertyValue("--zf-col-start")).toBe("3");
    expect(card.style.getPropertyValue("--zf-col-span")).toBe("3");
    expect(card.style.getPropertyValue("--zf-row-start")).toBe("2");
    expect(card.style.getPropertyValue("--zf-row-span")).toBe("2");
  });

  it("surface mode: dark (default) sets the original ink/surface lightness (a no-op)", () => {
    const { container } = renderDashboard([inst("marker", { label: "x" })]);
    const grid = container.querySelector(".zf-grid") as HTMLElement;
    const v = (n: string) => grid.style.getPropertyValue(n);
    expect(v("--zf-ink-l")).toBe("100%");
    expect(v("--zf-surf-l1")).toBe("12.5%");
    expect(v("--zf-surf-l2")).toBe("7%");
    expect(v("--zf-surf-l3")).toBe("5.3%");
  });

  it("surface mode: light flips the ink + card-surface lightness", () => {
    const { container } = renderDashboard([inst("marker", { label: "x" })], {
      theme: { surface: "light" },
    });
    const grid = container.querySelector(".zf-grid") as HTMLElement;
    const v = (n: string) => grid.style.getPropertyValue(n);
    expect(v("--zf-ink-l")).toBe("16%");
    expect(v("--zf-surf-l1")).toBe("98%");
    expect(v("--zf-surf-l2")).toBe("96%");
    expect(v("--zf-surf-l3")).toBe("94%");
  });

  it("per-frame style overrides emit inline --zf-* vars on that card only", () => {
    const { container } = renderDashboard([
      {
        ...inst("marker", { label: "x" }),
        style: {
          accentHue: 320,
          accentSat: 95,
          surfaceOpacity: 0.5,
          radius: 24,
        },
      },
    ]);
    const card = container.querySelector(".zf-frame") as HTMLElement;
    expect(card.style.getPropertyValue("--zf-accent-hue")).toBe("320");
    expect(card.style.getPropertyValue("--zf-accent-sat")).toBe("95%");
    expect(card.style.getPropertyValue("--zf-surface-opacity")).toBe("0.5");
    expect(card.style.getPropertyValue("--zf-frame-radius")).toBe("24px");
    // Untouched knobs stay unset on the card (inherit the dashboard default).
    expect(card.style.getPropertyValue("--zf-elevation")).toBe("");
  });
});
