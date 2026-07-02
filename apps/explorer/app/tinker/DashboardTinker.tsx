"use client";

import { DashboardEditor } from "@zframes/core/editor";
import {
  DashboardSpecSchema,
  FramesProvider,
  type DashboardSpec,
} from "@zframes/core";
import { useCallback, useRef, useState } from "react";
import "gridstack/dist/gridstack.min.css";
import { PublishDialog } from "@/app/lib/PublishDialog";
import { providers, registry } from "@/app/lib/frames";

// Client-only module (the page dynamic-imports it ssr:false) — DashboardEditor
// (GridStack) + localStorage both run in the browser.
const STORAGE_KEY = "zframes:tinker-spec";

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
  // The editor only reads `spec` at mount; onSave hands us the live spec, which
  // we keep in a ref so Publish always sends the latest edited state.
  const latest = useRef<DashboardSpec>(spec);
  const [saved, setSaved] = useState(false);
  const [showPublish, setShowPublish] = useState(false);

  const onSave = useCallback(async (next: DashboardSpec) => {
    latest.current = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch {
      /* storage unavailable — edits stay on screen */
    }
  }, []);

  return (
    <FramesProvider providers={providers}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 pt-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Tinker</h1>
          <p className="text-xs text-white/55">
            Customise then Save (this browser), or Publish to a shareable link.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowPublish(true)}
          className="rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-3 py-1.5 text-sm font-medium text-indigo-100 transition-colors hover:bg-indigo-500/25"
        >
          Publish →
        </button>
      </div>

      <main className="mx-auto max-w-7xl px-6 py-4">
        <DashboardEditor spec={spec} registry={registry} onSave={onSave} />
      </main>

      {showPublish && (
        <PublishDialog getSpec={() => latest.current} onClose={() => setShowPublish(false)} />
      )}
      {saved ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[#3fd08f]/40 bg-[#3fd08f]/15 px-4 py-1.5 text-sm text-[#3fd08f] shadow-lg">
          Saved to this browser
        </div>
      ) : null}
    </FramesProvider>
  );
}
