"use client";

import {
  FRAME_CSS,
  FrameContent,
  FramesProvider,
  type FrameInstance,
} from "@zframes/core";
import { buildDefaultConfig } from "@zframes/editor/editor-symbols";
import { allFrames } from "@zframes/frames";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { providers, registry } from "@/app/lib/frames";

// A single REAL frame rendered live on the landing — the same FrameContent the
// runtime renders, fed by the app-wide provider singletons (one shared WS, one
// cache; see lib/frames.ts). Used by the hero's floating cluster and the frames
// showcase, so the marketing surface is literally built out of the product.
//
// Costs are bounded the same way LiveBoardFrame bounds its iframes:
//   • data cost — the frame only MOUNTS once it nears the viewport
//     (IntersectionObserver, one-shot), so below-the-fold frames open no
//     socket subscriptions and start no polls until they're almost visible.
//   • interaction — display-only by default (pointer-events:none): these are
//     specimens in a showcase, not widgets to fiddle with mid-scroll.

const byName = new Map(allFrames.map((def) => [def.name, def]));

/** Inject the dashboard's frame stylesheet once per page. Render one instance
 *  near the top of any page that uses <LiveFrame>. */
export function LiveFrameStyles() {
  return <style>{FRAME_CSS}</style>;
}

export function LiveFrame({
  frame,
  config,
  title,
  className,
  interactive = false,
  rootMargin = "480px 0px",
}: {
  frame: string;
  /** Partial config merged over the frame's schema-valid defaults. */
  config?: Record<string, unknown>;
  /** Optional card title override (defaults to the frame's own chrome). */
  title?: string;
  className?: string;
  /** Allow hover/scroll inside the frame (default: display-only). */
  interactive?: boolean;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  // Unique per component instance, so the same frame type can appear twice on
  // one page (hero + showcase) without instance-id collisions.
  const uid = useId();

  useEffect(() => {
    if (mounted) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMounted(true); // one-shot: keep data flowing once opened
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted, rootMargin]);

  const def = byName.get(frame);
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
    <div
      ref={ref}
      // h-full so the frame stretches to the caller's sized wrapper even when
      // its content has no intrinsic height (clock, gauges).
      className={`h-full w-full ${
        interactive ? "" : "pointer-events-none select-none "
      }${className ?? ""}`}
    >
      {mounted ? (
        <FramesProvider providers={providers}>
          <FrameContent
            instance={instance}
            registry={registry}
            className="h-full w-full"
          />
        </FramesProvider>
      ) : (
        // Placeholder with the same footprint so nothing reflows on mount.
        <div className="zf-surface h-full w-full opacity-40" />
      )}
    </div>
  );
}
