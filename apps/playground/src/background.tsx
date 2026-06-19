import type { DashboardBackground as BackgroundConfig } from "@zframes/core";
import { lazy, Suspense } from "react";

// Lazy so dashboards that don't use a Unicorn scene never fetch the SDK bundle.
const UnicornScene = lazy(() => import("unicornstudio-react"));

const SDK_URL =
  "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.2.5/dist/unicornStudio.umd.js";

/**
 * Full-viewport background behind the dashboard. The spec picks *what* the
 * background is ("unicorn" + projectId); the host (this file) renders it —
 * same split as data providers, so the heavy WebGL engine never reaches
 * @zframes/core or the React-free tooling path.
 *
 * The scene renders at the spec's `opacity` (a moderate ~0.15 by default) and
 * a contrast scrim sits over it, so frame text stays legible even if a user
 * raises the opacity. If the Unicorn SDK fails to load (offline, CDN down,
 * bad projectId), nothing renders here and the body's dark gradient shows
 * through — a graceful default.
 */
export function DashboardBackground({
  background,
}: {
  background: BackgroundConfig;
}) {
  if (background.type !== "unicorn" || !background.projectId) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <div
        style={{ position: "absolute", inset: 0, opacity: background.opacity }}
      >
        <Suspense fallback={null}>
          <UnicornScene
            projectId={background.projectId}
            width="100vw"
            height="100vh"
            scale={background.scale}
            dpi={background.dpi}
            sdkUrl={SDK_URL}
          />
        </Suspense>
      </div>
      {/* Contrast scrim — lighter at the top-center, darker toward the edges,
          so motion reads at the margins while content stays legible. Cards are
          opaque, so the scrim can stay light enough to let the scene breathe in
          the gutters. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(1340px 800px at 50% 16%, rgba(7,7,12,0.24), rgba(7,7,12,0.58) 60%, rgba(7,7,12,0.78)), linear-gradient(to bottom, transparent 48%, rgba(7,7,12,0.5))",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
