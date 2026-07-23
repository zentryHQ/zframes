"use client";

import { DashboardSpecSchema } from "@zframes/core";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { DashboardBackground } from "@/app/lib/DashboardBackground";

// The live board, client-only (shared WS + browser APIs) → dynamic ssr:false,
// same as the /d/[id] preview. This component IS the whole /embed/[id] document
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

export function EmbedBoard({ spec }: { spec: unknown }) {
  // Parse only to read the background + accent for the backdrop; DashboardView
  // re-parses and owns the invalid-spec message, so a bad spec just skips the bg.
  const parsed = DashboardSpecSchema.safeParse(spec);

  // Scene liveness starts OFF (an iframed board never boots a WebGL scene it's
  // about to be told to suspend — the static swatch covers the gap); board
  // visibility starts ON (content must render even if no parent ever messages).
  // Both flip after mount — immediately when the document is top-level, or as
  // the framing parent dictates. Effect-based init avoids any SSR/hydration
  // divergence.
  const [board, setBoard] = useState({ sceneActive: false, visible: true });
  useEffect(() => {
    if (window.self === window.top) {
      setBoard({ sceneActive: true, visible: true });
      return;
    }
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (isBoardMessage(e.data))
        setBoard({ sceneActive: e.data.sceneActive, visible: e.data.visible });
    };
    window.addEventListener("message", onMessage);
    // Hello AFTER the listener is attached — the parent replies with the current
    // state, so a state pushed before this document hydrated is never lost.
    window.parent.postMessage({ type: "zf:bg-hello" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

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
        <DashboardView spec={spec} />
      </div>
    </div>
  );
}
