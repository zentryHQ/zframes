"use client";

import { DashboardEditor } from "@zframes/core/editor";
import {
  DashboardSpecSchema,
  FramesProvider,
  type DashboardSpec,
} from "@zframes/core";
import { useCallback, useState } from "react";
import "gridstack/dist/gridstack.min.css";
import { providers, registry } from "@/app/lib/frames";

// This module is loaded client-only (the page dynamic-imports it with ssr:false),
// so DashboardEditor (GridStack owns the DOM) and localStorage are all safe to use
// directly, and the useState initializer runs with `window` defined.
const STORAGE_KEY = "zframes:tinker-spec";

// Written by "Make it mine" on a preview; falls back to a small starter when the
// tinker slot is empty (someone opened /tinker directly).
const STARTER = {
  version: "1.0.0",
  title: "My dashboard",
  author: "you",
  background: { type: "none" as const },
  frames: [
    {
      id: "hd",
      frame: "heading",
      position: { x: 0, y: 0, w: 12, h: 1 },
      config: {
        title: "My dashboard",
        subtitle: "Customise → drag, resize, add frames. Save persists to this browser.",
      },
    },
    { id: "btc", frame: "price-chart", title: "BTC", position: { x: 0, y: 1, w: 6, h: 3 }, config: { symbol: "BTC" } },
    { id: "fg", frame: "fear-greed", position: { x: 6, y: 1, w: 3, h: 3 }, config: {} },
  ],
};

function loadSpec(): DashboardSpec {
  const fallback = DashboardSpecSchema.parse(STARTER);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = DashboardSpecSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export default function DashboardTinker() {
  const [spec] = useState<DashboardSpec>(loadSpec);
  const [saved, setSaved] = useState(false);

  // Fork model: Save persists to localStorage only — no server write, no reload
  // (the editor keeps the just-saved spec on screen). This is the whole
  // "customise it and it's yours (in this browser)" loop.
  const onSave = useCallback(async (next: DashboardSpec) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch {
      /* localStorage unavailable — edits stay on screen, just not persisted */
    }
  }, []);

  return (
    <FramesProvider providers={providers}>
      {saved ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-4 py-1.5 text-sm text-emerald-200 shadow-lg">
          Saved to this browser
        </div>
      ) : null}
      <main className="mx-auto max-w-7xl px-6 py-6">
        <DashboardEditor spec={spec} registry={registry} onSave={onSave} />
      </main>
    </FramesProvider>
  );
}
