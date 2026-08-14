"use client";

import { DashboardSpecSchema } from "@zframes/spec/spec";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardBackground } from "@/app/lib/DashboardBackground";

// The live board, client-only (shared WS + browser APIs) → dynamic ssr:false,
// same as the /dashboard/[id] preview. This component IS the whole /embed/[id] document
// body — no chrome around it (AppShell renders bare on /embed/*). We render the
// board's OWN background here (the site's Aurora canvas is chrome, absent on
// /embed/*), so an iframed live board carries the living unicorn backdrop the
// rest of the site shows instead of sitting on flat near-black.
const DashboardView = dynamic(() => import("@/app/lib/DashboardView"), {
  ssr: false,
});

// Parent→embed board control (same-origin postMessage). The landing mounts five
// of these iframes in its sticky stack; the parent (LiveBoardFrame) tells each
// embed two things it cannot know from inside the iframe:
//   • sceneActive — whether its animated WebGL backdrop should be live (only
//     the settled front card's is).
//   • visible — whether the board is actually on show. A card COVERED by the
//     stack is still "intersecting" to every IntersectionObserver inside the
//     iframe (occlusion is invisible to IO), so its charts kept repainting and
//     its polls kept firing behind the front card. When hidden we put the board
//     under `content-visibility: hidden`: the subtree stops rendering AND its
//     per-frame IOs report not-intersecting, which flips core's existing
//     visibility gating (usePolled pause + liveline heartbeat) off for free.
//     React state survives, so a reveal repaints instantly with warm data.
// Standalone (top-level) embeds get no parent message and just run fully live.
//   • scrollProgress (`zf:scroll`) — how far through its own content the board
//     should be, 0..1, driven by the framing page's scroll. The iframe is only
//     one viewport tall but a real board is several, so the parent scrubs the
//     content THROUGH the frame while the panel itself holds still. Applied
//     straight to the DOM (a transform, no React state) because it arrives on
//     every scroll frame; the overflow it maps onto is measured here, inside the
//     iframe, since only this document knows its own content and viewport height.
type BoardMessage = {
  type: "zf:board";
  sceneActive: boolean;
  visible: boolean;
};

function isBoardMessage(data: unknown): data is BoardMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "zf:board" &&
    typeof (data as { sceneActive?: unknown }).sceneActive === "boolean" &&
    typeof (data as { visible?: unknown }).visible === "boolean"
  );
}

function scrollProgressOf(data: unknown): number | null {
  if (typeof data !== "object" || data === null) return null;
  const m = data as { type?: unknown; progress?: unknown };
  if (m.type !== "zf:scroll" || typeof m.progress !== "number") return null;
  return Math.min(1, Math.max(0, m.progress));
}

// Outer padding of the board shell (p-4, both edges) — the content's viewport is
// the iframe minus that, so overflow is measured against it.
const SHELL_PAD = 32;

export function EmbedBoard({ spec }: { spec: unknown }) {
  // Parse only to read the background + accent for the backdrop; DashboardView
  // re-parses and owns the invalid-spec message, so a bad spec just skips the bg.
  // Memoized: this component re-renders on every parent postMessage state flip,
  // and an unmemoized full-spec parse per render handed DashboardView a fresh
  // frames array each time — defeating React.memo on every card below it.
  const parsed = useMemo(() => DashboardSpecSchema.safeParse(spec), [spec]);

  // Scene liveness starts OFF (an iframed board never boots a WebGL scene it's
  // about to be told to suspend — the static swatch covers the gap); board
  // visibility starts ON (content must render even if no parent ever messages).
  // Both flip after mount — immediately when the document is top-level, or as
  // the framing parent dictates. Effect-based init avoids any SSR/hydration
  // divergence.
  const [board, setBoard] = useState({ sceneActive: false, visible: true });

  // Content scrub. `overflow` is how far the content exceeds the frame; it is
  // re-measured whenever the content resizes (frames settle, data arrives) and
  // the last progress is re-applied, so a board that grows mid-dwell doesn't
  // freeze part-way. Both live in refs — this runs on every scroll frame.
  const contentRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef(0);
  const progressRef = useRef(0);
  // The transform is written inside rAF, never in the message task: the parent
  // posts from its own frame loop, and applying synchronously in the message
  // handler put the style write outside this document's rendering cadence.
  const scrollRafRef = useRef(0);
  const applyScroll = useCallback(() => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const el = contentRef.current;
      if (!el) return;
      const y = -Math.round(overflowRef.current * progressRef.current);
      el.style.transform = `translate3d(0, ${y}px, 0)`;
    });
  }, []);
  useEffect(
    () => () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    },
    [],
  );
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    // rAF-coalesced: while 30 frames settle after load the ResizeObserver fires
    // many times, and each measure() is a forced layout (scrollHeight) of a
    // multi-viewport tree. One measure per animation frame at most.
    let rafId = 0;
    const measure = () => {
      rafId = 0;
      // A hidden board (content-visibility) measures as ~0 — keep the last known
      // overflow rather than snapping the content back to the top behind the stack.
      const h = el.scrollHeight;
      if (h <= 0) return;
      overflowRef.current = Math.max(0, h - (window.innerHeight - SHELL_PAD));
      applyScroll();
    };
    const queueMeasure = () => {
      if (!rafId) rafId = requestAnimationFrame(measure);
    };
    queueMeasure();
    const ro = new ResizeObserver(queueMeasure);
    ro.observe(el);
    window.addEventListener("resize", queueMeasure);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("resize", queueMeasure);
    };
  }, [applyScroll]);

  useEffect(() => {
    if (window.self === window.top) {
      setBoard({ sceneActive: true, visible: true });
      return;
    }
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (isBoardMessage(e.data))
        setBoard({ sceneActive: e.data.sceneActive, visible: e.data.visible });
      const p = scrollProgressOf(e.data);
      if (p !== null) {
        progressRef.current = p;
        applyScroll();
      }
    };
    window.addEventListener("message", onMessage);
    // Hello AFTER the listener is attached — the parent replies with the current
    // state, so a state pushed before this document hydrated is never lost.
    window.parent.postMessage({ type: "zf:bg-hello" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, [applyScroll]);

  return (
    <div className="relative min-h-screen w-full p-4">
      {parsed.success && (
        <DashboardBackground
          background={parsed.data.background}
          accentHue={parsed.data.theme.accentHue}
          accentSat={parsed.data.theme.accentSat}
          sceneActive={board.sceneActive}
        />
      )}
      <div
        className="relative z-10"
        style={{ contentVisibility: board.visible ? undefined : "hidden" }}
      >
        {/* Scrubbed by the framing page (`zf:scroll`); a standalone embed leaves
            progress at 0, so this is an identity transform and the document
            scrolls normally. No `will-change`: a permanently-promoted layer the
            size of the whole board re-rasters on every content repaint — the
            animated transform promotes it while actually scrubbing. */}
        <div ref={contentRef}>
          <DashboardView spec={spec} />
        </div>
      </div>
      {/* /embed/* renders bare (no AppShell, so no header demo pill), but the
          labelling rule still applies: simulated numbers must be visibly
          labelled on EVERY surface — including a board iframed into the
          landing showcase or a third-party page. */}
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-md border border-amber-400/20 bg-black/65 px-2 py-1 text-[11px] text-amber-300/90"
      >
        <span className="h-1 w-1 rounded-full bg-amber-400" />
        Demo data
      </div>
    </div>
  );
}
