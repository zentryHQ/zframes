"use client";

import {
  BACKGROUND_SCENES,
  SCENE_DEFAULT_PROJECT_ID,
  sceneBaseHue,
  type DashboardBackground as BackgroundConfig,
} from "@zframes/core";
import { useLowEndDevice, useReducedMotion } from "@zframes/unicorn";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

// The board's OWN background, rendered behind an embedded/live dashboard — the
// same what-vs-how split the runtime uses (spec declares the background;
// background.tsx there renders it). The explorer's site chrome paints the Aurora
// canvas site-wide, but the /embed/* routes render BARE (no chrome), so an
// iframed board otherwise sat on flat near-black. This gives each embedded board
// the living Unicorn backdrop the rest of the site shows: its declared scene, or
// — when it declares none (curated boards are `type:"none"`) — the default Aurora
// as a fallback, so every iframe carries the unicorn bg.
//
// A trimmed port of apps/runtime/src/background.tsx: no zAI orb active/thinking
// recolor (read-only preview, no orb), but it keeps the accent hue-rotate +
// saturate so a board's accent (green/magenta/orange curated looks) spins the
// Aurora to match its cards, exactly like the runtime.
const UnicornScene = lazy(() => import("@zframes/unicorn/scene"));
const SDK_URL = "/unicornStudio.umd.mjs";

const ACCENT_DEFAULT_HUE = 242;
const ACCENT_DEFAULT_SAT = 90;

// Shortest spin: map the offset into (-180, 180] so the transition never sweeps
// the long way round the wheel.
const accentRotation = (accentHue: number, sceneHue: number) => {
  const d = (((accentHue - sceneHue) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
};
// 90 (the spec default) → saturate(1), a no-op; a muted accent desaturates.
const accentSaturation = (accentSat: number) =>
  Math.round((accentSat / ACCENT_DEFAULT_SAT) * 1000) / 1000;

// Fallback Aurora opacity when a board declares no background of its own. Higher
// than the runtime's ~0.16 dashboard default so the scene clearly reads inside a
// small iframed preview — close to the site chrome's 0.7 backdrop.
const FALLBACK_OPACITY = 0.6;

// Grace before an inactive scene is torn down. Activation is instant; teardown
// waits so scroll jitter across a stack-transition boundary doesn't thrash the
// WebGL context through destroy/recreate cycles.
const DEACTIVATE_DELAY_MS = 1200;

export function DashboardBackground({
  background,
  accentHue = ACCENT_DEFAULT_HUE,
  accentSat = ACCENT_DEFAULT_SAT,
  sceneActive = true,
}: {
  background: BackgroundConfig;
  accentHue?: number;
  accentSat?: number;
  /**
   * Whether the animated scene should be LIVE. The landing's stacked showcase
   * mounts five of these at once but activates only the SETTLED front card —
   * none mid-transition, so an engine boot never lands on a busy scrolling
   * main thread; the parent drives this flag per board (see LiveBoardFrame →
   * postMessage → EmbedBoard) and covered/offscreen boards destroy their WebGL
   * scene instead of burning GPU behind other cards. The static swatch layer
   * below stays either way, so the peeking top strip of a covered card keeps
   * its scene's colour identity.
   */
  sceneActive?: boolean;
}) {
  // Both gates are SSR-safe (false on the server + hydration render, re-checked
  // after mount) and reactive to their media-query signals.
  const isLowEnd = useLowEndDevice();
  const reducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);
  // Whether the mounted scene has produced frames — lets a deactivate→
  // reactivate flip inside the teardown grace fade straight back in without
  // waiting for a scene-ready that already fired.
  const sceneRendered = useRef(false);

  // Hysteresis on deactivation only — mount immediately, unmount after a grace.
  const [sceneOn, setSceneOn] = useState(sceneActive);
  useEffect(() => {
    if (sceneActive) {
      setSceneOn(true);
      if (sceneRendered.current) setReady(true);
      return;
    }
    // Fade out NOW (900ms, to the static swatch below), destroy at the grace —
    // an abruptly unmounted canvas reads as a flash on a card whose top strip
    // is still peeking out of the stack.
    setReady(false);
    const t = setTimeout(() => setSceneOn(false), DEACTIVATE_DELAY_MS);
    return () => clearTimeout(t);
  }, [sceneActive]);
  useEffect(() => {
    if (!sceneOn) sceneRendered.current = false;
  }, [sceneOn]);

  // Static fills — painted straight from the spec, no gating needed.
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
  if (background.type === "image" && background.imageUrl) {
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

  // Unicorn scene — the board's own, or the default Aurora when it declares none
  // (or an image without a url yet). Degrades to the static swatch gradient on
  // the same signals the site backdrop uses (reduced-motion / low-end / load
  // failure) and while the scene is suspended (`sceneActive` off).
  const declared = background.type === "unicorn" && !!background.projectId;
  const projectId = declared
    ? (background.projectId as string)
    : SCENE_DEFAULT_PROJECT_ID;
  const opacity = declared ? background.opacity : FALLBACK_OPACITY;
  const scale = declared ? background.scale : 1;
  const dpi = declared ? background.dpi : 1.5;

  // Accent spin/desaturate relative to the loaded scene's authored hue — a scene
  // paired to a matching accent is a 0° no-op; a rolled accent drifts it, in
  // lockstep with the cards. Default hue 242 + sat 90 collapse to no filter.
  const rotation = accentRotation(accentHue, sceneBaseHue(projectId));
  const saturation = accentSaturation(accentSat);
  const filter =
    [
      rotation === 0 ? "" : `hue-rotate(${rotation}deg)`,
      saturation === 1 ? "" : `saturate(${saturation})`,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  // The scene's authored swatch gradient — a free static stand-in that keeps the
  // board's colour identity when the live scene is absent (suspended, loading,
  // low-end, reduced-motion), and smooths the scene's own fade-in.
  const swatch = BACKGROUND_SCENES.find(
    (s) => s.projectId === projectId,
  )?.swatch;
  const swatchLayer = swatch && (
    <div
      className="absolute inset-0"
      style={{ background: swatch, opacity: opacity * 0.6, filter }}
    />
  );

  if (isLowEnd || reducedMotion) {
    return swatchLayer ? (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        {swatchLayer}
      </div>
    ) : null;
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {swatchLayer}
      {/* Fades in once the engine is ready so there's no hard pop. */}
      <div
        className="absolute inset-0 transition-opacity duration-[900ms] ease-[var(--zf-ease-out,cubic-bezier(0.23,1,0.32,1))]"
        style={{ opacity: ready ? opacity : 0, filter }}
      >
        {sceneOn && (
          <Suspense fallback={null}>
            <UnicornScene
              key={projectId}
              projectId={projectId}
              sdkUrl={SDK_URL}
              width="100vw"
              height="100vh"
              scale={scale}
              dpi={dpi}
              // Fade in only once the scene is actually rendering — keying off
              // engine load (onLoad) ramped opacity over an empty canvas and
              // popped when the scene arrived mid-fade.
              onSceneReady={() => {
                sceneRendered.current = true;
                setReady(true);
              }}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
