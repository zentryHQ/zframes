import { useMemo } from "react";
import {
  DashboardRenderer,
  DashboardSpecSchema,
  FramesProvider,
  THEME_PRESETS,
  type AnyFrameDefinition,
  type DashboardSpec,
  type FrameLayout,
} from "@zframes/core";
import type { StoryGlobals } from "../.storybook/preview";
import { registry } from "./registry";
import { MockMarketDataProvider, type MockMode } from "@zframes/frames/testing";
import { liveProviders } from "./live-providers";

/**
 * A story's data source: one of the mock provider's four deterministic modes,
 * or `"live"` — the real keyless provider set (see `live-providers.ts`).
 */
export type CanvasMode = MockMode | "live";

const ROW = 96;
const GAP = 12;

const DENSITY: Record<StoryGlobals["density"], number> = {
  compact: 0.8,
  normal: 1,
  comfortable: 1.25,
};

const DEFAULT_LAYOUT: FrameLayout = { w: 4, h: 3 };

/**
 * Demo event markers for the "Events" toolbar toggle, attached to the story's
 * frame instance (markers belong to a card). Dated relative to now because the
 * mock provider's series are too (BASELINE_NOW), so they always land inside
 * whatever window a chart plots. Between them they exercise every branch of the
 * layer: a plain marker, a coloured one with a note and a source link, and two
 * a day apart that must collapse into one clustered flag.
 */
const DAY = 86_400_000;
const isoDaysAgo = (days: number): string => {
  const d = new Date(Date.now() - days * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(d.getDate()).padStart(2, "0")}`;
};
const DEMO_EVENTS = [
  {
    date: isoDaysAgo(46),
    label: "Rate decision",
    note: "Demo marker — the dashboard's own `events` list feeds these.",
    color: "#f5a524",
    url: "https://example.com/",
  },
  { date: isoDaysAgo(24), label: "CPI print" },
  { date: isoDaysAgo(9), label: "Earnings" },
  { date: isoDaysAgo(8), label: "Guidance cut" },
];

function sizeFor(
  frame: AnyFrameDefinition,
  size: StoryGlobals["frameSize"],
): { w: number; h: number } {
  const l = frame.layout ?? DEFAULT_LAYOUT;
  switch (size) {
    case "sm":
      return {
        w: l.minW ?? Math.max(2, Math.ceil(l.w / 2)),
        h: l.minH ?? Math.max(2, Math.ceil(l.h / 2)),
      };
    case "wide":
      return { w: l.maxW ?? Math.min(12, l.w * 2), h: l.h };
    case "tall":
      return { w: l.w, h: l.maxH ?? l.h * 2 };
    default:
      return { w: l.w, h: l.h };
  }
}

/**
 * Renders ONE frame in isolation by handing a single-frame DashboardSpec to the
 * real DashboardRenderer (which injects FRAME_CSS + all --zf-* theme vars and
 * routes chrome/error/loading exactly as production does). Cosmetics come from
 * the toolbar globals; data comes from the deterministic mock provider — or,
 * when `mode` is "live", from the real keyless provider set.
 */
export function FrameCanvas({
  frame,
  config,
  mode = "normal",
  size,
  globals,
}: {
  frame: AnyFrameDefinition;
  config: Record<string, unknown>;
  mode?: CanvasMode;
  /** Explicit grid span, overriding the toolbar's frame-size global. */
  size?: { w: number; h: number };
  globals: StoryGlobals;
}) {
  const { themePreset, frameSize, density, events } = globals;
  const providers = useMemo(
    () =>
      mode === "live" ? liveProviders() : [new MockMarketDataProvider(mode)],
    [mode],
  );
  const { w, h } = size ?? sizeFor(frame, frameSize);
  const configKey = JSON.stringify(config);

  const spec = useMemo<DashboardSpec>(() => {
    const preset =
      THEME_PRESETS.find((p) => p.key === themePreset) ?? THEME_PRESETS[0];
    const base = DashboardSpecSchema.parse({
      title: "storybook",
      grid: {
        mode: "flow-vertical",
        columns: w,
        rowHeight: ROW,
        gap: GAP,
        rows: h,
      },
      frames: [
        {
          id: "sb",
          frame: frame.name,
          position: { x: 0, y: 0, w, h },
          config,
          // Markers live on the card, so they ride the frame instance. Only an
          // `annotatable` frame draws them; on anything else this is inert.
          ...(events === "off" || !frame.annotatable
            ? {}
            : { events: DEMO_EVENTS }),
        },
      ],
    });
    return {
      ...base,
      // presets set accent/base only — keep the default semantic up/down colours
      theme: { ...base.theme, ...preset.theme },
      // presets set family + numeric only — keep the default scale
      typography: { ...base.typography, ...preset.typography },
      appearance: {
        ...base.appearance,
        ...preset.appearance,
        density: DENSITY[density] ?? preset.appearance.density,
      },
    };
    // configKey stands in for the config object identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.name, configKey, themePreset, w, h, density, events]);

  const widthPx = w * ROW + (w - 1) * GAP;

  return (
    <FramesProvider providers={providers}>
      <div
        style={{
          width: widthPx,
          maxWidth: "100%",
          margin: "0 auto",
          padding: 16,
        }}
      >
        <DashboardRenderer spec={spec} registry={registry} />
      </div>
    </FramesProvider>
  );
}
