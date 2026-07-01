// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import {
  createRegistry,
  DashboardRenderer,
  DashboardSpecSchema,
  FramesProvider,
  type DashboardSpec,
} from "@zframes/core";
import { buildDefaultConfig } from "@zframes/core/editor-symbols";
import { allFrames } from "./index";
import { MockMarketDataProvider, type MockMode } from "./testing/mock-provider";

// A crash net for every frame: render each one through the REAL DashboardRenderer
// (same chrome / error-card / capability routing as production) fed by the
// deterministic offline MockMarketDataProvider, across the provider's modes.
// We assert the dashboard never crashes (a card element always mounts) and — in
// the normal-data mode — that the frame renders real content, not the renderer's
// error card (which would mean buildDefaultConfig seeded invalid config, a
// missing capability, or a render throw). We assert behaviour, not pixels.

// jsdom lacks these browser APIs the renderer + charts + canvas frames touch;
// stub them so a missing global can't masquerade as a frame bug.
beforeAll(() => {
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  const g = globalThis as unknown as Record<string, unknown>;
  g.IntersectionObserver = NoopObserver;
  g.ResizeObserver = NoopObserver;
  if (!g.matchMedia) {
    g.matchMedia = () => ({
      matches: false,
      media: "",
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    });
  }
  // A tolerant 2D context so liveline/game frames draw into a no-op instead of
  // throwing on a null context (jsdom has no canvas backend).
  const ctx2d = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "measureText") return () => ({ width: 0 });
        if (prop === "getImageData")
          return () => ({ data: new Uint8ClampedArray(4) });
        if (
          prop === "createLinearGradient" ||
          prop === "createRadialGradient" ||
          prop === "createPattern"
        )
          return () => ({ addColorStop() {} });
        return () => {};
      },
      set() {
        return true;
      },
    },
  );
  HTMLCanvasElement.prototype.getContext = (() =>
    ctx2d) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

const registry = createRegistry(allFrames);
const MODES: MockMode[] = ["normal", "empty", "loading", "error"];

/** A one-frame dashboard spec with schema-valid seeded config for `frameName`. */
function specFor(
  frameName: string,
  config: Record<string, unknown>,
): DashboardSpec {
  return DashboardSpecSchema.parse({
    title: "smoke",
    grid: {
      mode: "flow-vertical",
      columns: 6,
      rowHeight: 96,
      gap: 12,
      rows: 4,
    },
    frames: [
      {
        id: "s",
        frame: frameName,
        position: { x: 0, y: 0, w: 4, h: 3 },
        config,
      },
    ],
  });
}

async function renderFrame(spec: DashboardSpec, mode: MockMode) {
  const provider = new MockMarketDataProvider(mode);
  const result = render(
    <FramesProvider providers={[provider]}>
      <DashboardRenderer spec={spec} registry={registry} />
    </FramesProvider>,
  );
  // Flush the mock's resolved/rejected data promises + effects inside act so
  // state settles (and rejections are caught by the frames) before we assert.
  await act(async () => {
    await Promise.resolve();
  });
  return result;
}

afterEach(() => {
  cleanup();
});

describe("every frame renders without crashing the dashboard", () => {
  it.each(allFrames)(
    "$name mounts a card in all provider modes",
    async (frame) => {
      const config = buildDefaultConfig(frame);
      for (const mode of MODES) {
        const { container } = await renderFrame(
          specFor(frame.name, config),
          mode,
        );
        // A card (or bare zone) always mounts — the renderer never lets a frame
        // take down the dashboard; the worst case is a contained error card.
        const card = container.querySelector(".zf-frame, .zf-bare");
        expect(card, `${frame.name} [${mode}] mounted no card`).not.toBeNull();
        cleanup();
      }
    },
  );

  it.each(allFrames)(
    "$name renders real content (not an error card) with normal data",
    async (frame) => {
      const config = buildDefaultConfig(frame);
      const { container } = await renderFrame(
        specFor(frame.name, config),
        "normal",
      );
      // No renderer error card => valid seeded config, capability present, and
      // no render/effect throw. Data-fetch failures are a DIFFERENT path (the
      // frame's own empty/error UI), only exercised by the error mode above.
      const errorCard = container.querySelector(".zf-frame--error");
      expect(
        errorCard,
        `${frame.name} rendered an error card with normal data`,
      ).toBeNull();
    },
  );
});
