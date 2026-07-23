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

// Parent→embed scene control (same-origin postMessage). The landing mounts five
// of these iframes in its sticky stack but only the settled front card should
// animate, so the parent tells each embed whether its backdrop should be live
// (LiveBoardFrame sends `zf:bg-active`). Standalone (top-level) embeds get no
// parent message and just animate.
type BgMessage = { type: "zf:bg-active"; active: boolean };

function isBgMessage(data: unknown): data is BgMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "zf:bg-active" &&
    typeof (data as { active?: unknown }).active === "boolean"
  );
}

export function EmbedBoard({ spec }: { spec: unknown }) {
  // Parse only to read the background + accent for the backdrop; DashboardView
  // re-parses and owns the invalid-spec message, so a bad spec just skips the bg.
  const parsed = DashboardSpecSchema.safeParse(spec);

  // Scene liveness: starts OFF and flips on after mount — immediately when the
  // document is top-level, or when the framing parent says so. An iframed board
  // therefore never boots a WebGL scene it's about to be told to suspend (the
  // static swatch layer covers the gap), and effect-based init avoids any
  // SSR/hydration divergence.
  const [bgActive, setBgActive] = useState(false);
  useEffect(() => {
    if (window.self === window.top) {
      setBgActive(true);
      return;
    }
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (isBgMessage(e.data)) setBgActive(e.data.active);
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
          sceneActive={bgActive}
        />
      )}
      <div className="relative z-10">
        <DashboardView spec={spec} />
      </div>
    </div>
  );
}
