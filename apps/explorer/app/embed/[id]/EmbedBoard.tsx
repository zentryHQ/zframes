"use client";

import dynamic from "next/dynamic";

// The live board, client-only (shared WS + browser APIs) → dynamic ssr:false,
// same as the /d/[id] preview. This component IS the whole /embed/[id] document
// body — no chrome around it (AppShell renders bare on /embed/*), so the iframe in
// the landing showcase frames nothing but the board on the terminal's own near-black.
const DashboardView = dynamic(() => import("@/app/lib/DashboardView"), {
  ssr: false,
});

export function EmbedBoard({ spec }: { spec: unknown }) {
  return (
    <div className="min-h-screen w-full p-4">
      <DashboardView spec={spec} />
    </div>
  );
}
