import type { DashboardBackground as BackgroundConfig } from "@zframes/core";
import { lazy, Suspense } from "react";

// Lazy so dashboards that don't use a Unicorn scene never fetch the SDK bundle.
const UnicornScene = lazy(() => import("unicornstudio-react"));

// Self-hosted from apps/runtime/public/ so the engine ships in the prebuilt
// bundle instead of being pulled from a CDN. This is the MODERN engine (reads
// the hosted `layers`-format projects); `unicornstudio-react` loads it onto
// window.UnicornStudio. The orb deliberately uses a DIFFERENT, isolated legacy
// engine for its v1.4.29 scene (see src/unicorn/sdk.ts) — the two builds can't
// be unified, so they're kept on separate globals to avoid a version clash.
const SDK_URL = "/unicornStudio.umd.mjs";

// When the zAI orb is open the background "charges": it recolors and brightens.
// Pure CSS on the wrapper (engine-agnostic, reliable) — the scene's own WebGL
// animation lives behind the canvas and isn't a CSS knob. (The modern engine
// DOES expose mutable per-layer `speed` via the scene handle, so a speed bump
// on open is wireable too — left out here intentionally.) Tunable here.
const ACTIVE_FILTER = "invert(1) hue-rotate(180deg) saturate(1.25)";
const ACTIVE_TRANSITION =
  "opacity 0.5s var(--zf-ease-out), filter 0.5s var(--zf-ease-out)";
// Opening the orb lifts the (deliberately low) resting opacity so the recolor
// actually reads, capped so the backdrop never overpowers the cards.
const activeOpacity = (resting: number) => Math.min(0.42, resting * 2.4);

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
 *
 * `active` (the zAI orb's open state, lifted in App) recolors + brightens the
 * scene so opening zAI visibly energizes the backdrop.
 */
export function DashboardBackground({
  background,
  active = false,
}: {
  background: BackgroundConfig;
  active?: boolean;
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
        style={{
          position: "absolute",
          inset: 0,
          opacity: active
            ? activeOpacity(background.opacity)
            : background.opacity,
          filter: active ? ACTIVE_FILTER : "none",
          transition: ACTIVE_TRANSITION,
          willChange: "opacity, filter",
        }}
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
    </div>
  );
}
