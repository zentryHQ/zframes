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
import { MockMarketDataProvider, type MockMode } from "./mock-provider";

const ROW = 96;
const GAP = 12;

const DENSITY: Record<StoryGlobals["density"], number> = {
  compact: 0.8,
  normal: 1,
  comfortable: 1.25,
};

const DEFAULT_LAYOUT: FrameLayout = { w: 4, h: 3 };

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
 * the toolbar globals; data comes from the deterministic mock provider.
 */
export function FrameCanvas({
  frame,
  config,
  mode = "normal",
  globals,
}: {
  frame: AnyFrameDefinition;
  config: Record<string, unknown>;
  mode?: MockMode;
  globals: StoryGlobals;
}) {
  const { themePreset, frameSize, density } = globals;
  const provider = useMemo(() => new MockMarketDataProvider(mode), [mode]);
  const { w, h } = sizeFor(frame, frameSize);
  const configKey = JSON.stringify(config);

  const spec = useMemo<DashboardSpec>(() => {
    const preset =
      THEME_PRESETS.find((p) => p.key === themePreset) ?? THEME_PRESETS[0];
    const base = DashboardSpecSchema.parse({
      title: "storybook",
      grid: { mode: "flow-vertical", columns: w, rowHeight: ROW, gap: GAP, rows: h },
      frames: [
        { id: "sb", frame: frame.name, position: { x: 0, y: 0, w, h }, config },
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
  }, [frame.name, configKey, themePreset, w, h, density]);

  const widthPx = w * ROW + (w - 1) * GAP;

  return (
    <FramesProvider providers={[provider]}>
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
