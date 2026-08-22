"use client";

import {
  FRAME_CSS,
  FrameContent,
  FramesProvider,
  type FrameInstance,
} from "@zframes/core";
import { buildDefaultConfig } from "@zframes/editor/editor-symbols";
import { useId, useMemo } from "react";
import { providers, registry } from "@/app/lib/frames";

// The heavy half of <LiveFrame> — everything that drags the frame engine into
// the bundle (the lazy registry's ~285 Zod metas, the mock provider, core's
// FrameContent/hooks) lives HERE, behind LiveFrame's dynamic import. The
// landing's initial chunks ship only the IntersectionObserver shell; this
// module loads once, when the first frame on the page nears the viewport.
// Keep this file free of exports the shell could be tempted to re-import
// eagerly — anything imported by LiveFrame.tsx itself defeats the split.

export default function LiveFrameInner({
  frame,
  config,
  title,
}: {
  frame: string;
  /** Partial config merged over the frame's schema-valid defaults. */
  config?: Record<string, unknown>;
  /** Optional card title override (defaults to the frame's own chrome). */
  title?: string;
}) {
  // Unique per component instance, so the same frame type can appear twice on
  // one page (hero + showcase) without instance-id collisions.
  const uid = useId();

  // The lazy registry's entries carry the full meta (layout, schema) eagerly;
  // only the component chunk defers, and FrameContent renders it in Suspense.
  const def = registry.get(frame);
  const instance = useMemo<FrameInstance | null>(() => {
    if (!def) return null;
    return {
      id: `landing-${frame}-${uid}`,
      frame,
      ...(title ? { title } : {}),
      position: { x: 0, y: 0, w: def.layout?.w ?? 4, h: def.layout?.h ?? 3 },
      config: { ...buildDefaultConfig(def), ...(config ?? {}) },
    };
  }, [def, frame, title, config, uid]);

  if (!def || !instance) return null;

  return (
    <>
      {/* The dashboard's frame stylesheet, injected alongside the first live
          frame. Same href/precedence as DashboardRenderer's copy, so React 19
          hoists every instance into one document tag. (The pre-mount
          placeholder needs none of this — `.zf-surface` is globals.css.) */}
      <style href="zframes-frame-css" precedence="zframes">
        {FRAME_CSS}
      </style>
      <FramesProvider providers={providers}>
        <FrameContent
          instance={instance}
          registry={registry}
          className="h-full w-full"
        />
      </FramesProvider>
    </>
  );
}
