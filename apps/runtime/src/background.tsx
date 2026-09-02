import type { DashboardBackground as BackgroundConfig } from "@zframes/core";
import { useLowEndDevice } from "@zframes/unicorn";
import {
  ACCENT_DEFAULT_HUE,
  ACCENT_DEFAULT_SAT,
  accentRotation,
  accentSaturation,
} from "@zframes/unicorn/accent";
import { lazy, memo, Suspense } from "react";

// Lazy so dashboards with no Unicorn scene never load the (tiny) scene module.
// In-house loader (@zframes/unicorn, shared with the explorer), NOT the
// `unicornstudio-react` npm package: that package inlines a full ~1.3 MB copy of
// the engine in its module even when you load the engine from a URL (which we
// always do), so it shipped ~257 kB gzip of dead weight. Ours injects only the
// self-hosted engine below.
const UnicornScene = lazy(() => import("@zframes/unicorn/scene"));

// Self-hosted from apps/runtime/public/ so the engine ships in the prebuilt
// bundle instead of being pulled from a CDN. This is the MODERN engine (reads
// the hosted `layers`-format projects); our loader injects it onto
// window.UnicornStudio at runtime. The orb deliberately uses a DIFFERENT,
// isolated legacy engine for its v1.4.29 scene (see src/unicorn/sdk.ts) — the
// two builds can't be unified, so they're kept on separate globals to avoid a
// version clash.
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

// The accent→filter math (hue-rotate + saturate, relative to the loaded scene's
// own authored hue) lives in @zframes/unicorn/accent — the explorer's embedded
// board backdrop applies the identical numbers, and the two drifting apart would
// show as one host spinning a scene the other left alone. The signature aurora
// scene is authored at 242 (the zframes purple), the default sceneHue, so an
// unrolled default dashboard is a 0° no-op rendered exactly as authored.
const DEFAULT_SCENE_HUE = 242;

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
 * `accentHue` spins the whole scene via a CSS hue-rotate (relative to `sceneHue`,
 * the loaded scene's authored hue) and `accentSat` desaturates it via saturate(),
 * so the backdrop tracks the dashboard's accent (live as the sliders drag). A
 * scene whose authored hue matches the accent (every preset pairs one) and the
 * default sat 90 map to a no-op, so it renders the scene exactly as authored.
 *
 * `thinking` (the zAI orb's busy state, lifted in App) brings the backdrop to
 * life while zAI works: it continuously cycles its hue AND breathes (a saturation
 * + brightness pulse). Two stacked filter layers nested *inside* the accent-tint
 * layer — one per animation, since both animate `filter` and would otherwise
 * clobber each other — so they compose on top of the static accent tint (and the
 * orb-open charge) instead of replacing it. Both self-disable under reduced-motion.
 */
export const DashboardBackground = memo(function DashboardBackground({
  background,
  surface = "dark",
  active = false,
  thinking = false,
  accentHue = ACCENT_DEFAULT_HUE,
  accentSat = ACCENT_DEFAULT_SAT,
  sceneHue = DEFAULT_SCENE_HUE,
}: {
  background: BackgroundConfig;
  /** Dashboard surface mode — light mode paints a light default backdrop so the
   *  gutters match the light cards (the dark body glow would clash). */
  surface?: "dark" | "light";
  active?: boolean;
  thinking?: boolean;
  accentHue?: number;
  accentSat?: number;
  /** The loaded scene's authored hue — the reference the accent rotates from
   *  (host resolves it from the projectId via @zframes/core's sceneBaseHue). */
  sceneHue?: number;
}) {
  // On weak / metered / small-touch devices, skip the WebGL scene entirely —
  // it's a fixed full-screen GPU + bandwidth tax that a low-end phone can't
  // spare. The static fills below (and the unicorn downgrade) still apply.
  const isLowEnd = useLowEndDevice();

  // Light surface with no explicit/renderable backdrop: a soft light fill so the
  // gutters read light like the cards (the dark body glow would clash). Every
  // "render nothing" exit below returns this instead of null, so the clash never
  // appears — not on low-end (skipped unicorn), nor an image with no URL yet, nor
  // type "none". In dark mode it's null → the body's signature indigo glow shows.
  const lightFill =
    surface === "light" ? (
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: "linear-gradient(160deg, #f4f5f8, #e6e8f0)",
        }}
      />
    ) : null;

  // Solid colour / custom gradient: a single opaque full-bleed fill painted
  // straight from the spec (the orb's recolor filters are scene-specific, so a
  // static fill doesn't take them). "none" renders nothing here — the body's
  // signature indigo glow (styles.css) shows through.
  if (background.type === "color" || background.type === "gradient") {
    const fill =
      background.type === "color"
        ? background.color
        : `linear-gradient(${background.gradientAngle}deg, ${background.gradientFrom}, ${background.gradientTo})`;
    return (
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: fill,
        }}
      />
    );
  }
  // Full-bleed background image: a static <img> (not a CSS url(), which a
  // forked/shared dashboard could break out of) under a dark scrim so card text
  // stays legible. Optional blur softens a busy photo; when blurred the image is
  // slightly scaled so the blur's soft edge never reveals the backdrop.
  if (background.type === "image") {
    if (!background.imageUrl) return lightFill;
    const blur = background.imageBlur;
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
        <img
          src={background.imageUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: background.imageFit,
            filter: blur > 0 ? `blur(${blur}px)` : undefined,
            transform: blur > 0 ? "scale(1.08)" : undefined,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `rgba(0,0,0,${background.overlayOpacity})`,
          }}
        />
      </div>
    );
  }
  // No unicorn scene (type "none", or unicorn without a projectId): nothing to
  // paint in dark mode (body glow shows); the light fill in light mode.
  if (background.type !== "unicorn" || !background.projectId) return lightFill;

  // Low-end: downgrade the WebGL scene to the body's static gradient glow
  // (styles.css body::before) — the same graceful default used when the engine
  // fails to load. Returning here means the lazy <UnicornScene> never mounts, so
  // the self-hosted engine is never even fetched. The orb's active/thinking
  // recolor is scene-only, so it's a no-op here — acceptable on weak hardware.
  if (isLowEnd) return lightFill;

  // An invisible scene is still a full engine + project download and a
  // permanent full-viewport WebGL context, rendering every frame for the whole
  // session behind nothing. Opacity 0 means "no backdrop", so take the same
  // exit as type "none".
  if (background.opacity <= 0) return lightFill;

  // Compose the accent spin + desaturation with the orb's "charge" filter: the
  // rolled/muted scene is the base, the orb's invert/rotate/saturate stacks on
  // top when it's open. Default hue 242 + sat 90 collapse to no filter at all.
  const rotation = accentRotation(accentHue, sceneHue);
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
    <>
      {/* The scene is translucent (~0.15) over whatever is behind it, so on a
          light board it needs the same light fill underneath that every other
          "no scene" exit above returns — without it this was the one path that
          left a light board with dark gutters, i.e. a capable machine rendered
          light mode wrongly and a weak one rendered it correctly. */}
      {lightFill}
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
            // Only hint the compositor while something is actually animating
            // opacity/filter (orb active or thinking). Held permanently it pins
            // a full-viewport layer backing store for the whole session — pure
            // tax in the common idle state.
            willChange: active || thinking ? "opacity, filter" : "auto",
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
                {/* key on projectId so switching scenes (e.g. from the editor's
                    Background gallery) fully remounts the WebGL scene rather than
                    trying to mutate a live one. */}
                <UnicornScene
                  key={background.projectId}
                  projectId={background.projectId}
                  width="100vw"
                  height="100vh"
                  scale={background.scale}
                  dpi={background.dpi}
                  // A slow-drifting backdrop at 16% opacity behind opaque cards
                  // reads identically at 30fps and costs half the GPU — and this
                  // is the single most expensive thing the dashboard draws
                  // (full-viewport, every frame, for the whole session). The
                  // explorer already renders the same scene this way; the runtime
                  // was left on the engine's 60fps default.
                  fps={30}
                  sdkUrl={SDK_URL}
                />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});
