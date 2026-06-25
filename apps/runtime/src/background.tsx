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

// The scene's colors are baked into the hosted Unicorn project — the host can't
// repaint the WebGL, but a CSS hue-rotate on the wrapper spins the whole scene
// (engine-agnostic, the same trick the orb's "charge" uses). We rotate by how far
// the dashboard accent has moved from its default, so accentHue 242 (the zframes
// purple) is a 0° no-op that renders the scene exactly as authored, and any
// rolled/edited hue spins the backdrop in lockstep with the card accents.
const ACCENT_DEFAULT_HUE = 242;
// Shortest spin: map the offset into (-180, 180] so the transition never sweeps
// the long way round the wheel.
const accentRotation = (accentHue: number) => {
  const d = (((accentHue - ACCENT_DEFAULT_HUE) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
};
// Accent saturation rides along too: a muted accent (low accentSat) desaturates
// the scene via a saturate() filter so "muted" reads muted in the backdrop, not
// just on the cards. 90 (the spec default) maps to saturate(1) — a no-op.
const ACCENT_DEFAULT_SAT = 90;
const accentSaturation = (accentSat: number) =>
  Math.round((accentSat / ACCENT_DEFAULT_SAT) * 1000) / 1000;

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
 *
 * `accentHue` spins the whole scene via a CSS hue-rotate and `accentSat`
 * desaturates it via saturate(), so the backdrop tracks the dashboard's accent
 * (live as the sliders drag); the defaults (hue 242, sat 90) map to a no-op, so
 * an unrolled dashboard renders the scene exactly as authored.
 *
 * `thinking` (the zAI orb's busy state, lifted in App) brings the backdrop to
 * life while zAI works: it continuously cycles its hue AND breathes (a saturation
 * + brightness pulse). Two stacked filter layers nested *inside* the accent-tint
 * layer — one per animation, since both animate `filter` and would otherwise
 * clobber each other — so they compose on top of the static accent tint (and the
 * orb-open charge) instead of replacing it. Both self-disable under reduced-motion.
 */
export function DashboardBackground({
  background,
  active = false,
  thinking = false,
  accentHue = ACCENT_DEFAULT_HUE,
  accentSat = ACCENT_DEFAULT_SAT,
}: {
  background: BackgroundConfig;
  active?: boolean;
  thinking?: boolean;
  accentHue?: number;
  accentSat?: number;
}) {
  if (background.type !== "unicorn" || !background.projectId) return null;

  // Compose the accent spin + desaturation with the orb's "charge" filter: the
  // rolled/muted scene is the base, the orb's invert/rotate/saturate stacks on
  // top when it's open. Default hue 242 + sat 90 collapse to no filter at all.
  const rotation = accentRotation(accentHue);
  const saturation = accentSaturation(accentSat);
  const baseFilter = [
    rotation === 0 ? "" : `hue-rotate(${rotation}deg)`,
    saturation === 1 ? "" : `saturate(${saturation})`,
  ]
    .filter(Boolean)
    .join(" ");
  const restFilter = baseFilter || "none";
  const activeFilter = baseFilter
    ? `${baseFilter} ${ACTIVE_FILTER}`
    : ACTIVE_FILTER;

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
          filter: active ? activeFilter : restFilter,
          transition: ACTIVE_TRANSITION,
          willChange: "opacity, filter",
        }}
      >
        {/* Two nested layers so the hue cycle and the breathe pulse — both of
            which animate `filter` — don't clobber each other, and both compose
            ON TOP of the accent tint above. The animations live in styles.css
            (.zf-bg-hue + .zf-bg-breathe), gated on prefers-reduced-motion, so
            these classNames are no-ops when thinking is off or motion is reduced. */}
        <div
          className={thinking ? "zf-bg-hue" : undefined}
          style={{ position: "absolute", inset: 0 }}
        >
          <div
            className={thinking ? "zf-bg-breathe" : undefined}
            style={{ position: "absolute", inset: 0 }}
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
      </div>
    </div>
  );
}
