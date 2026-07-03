"use client";

import { SCENE_DEFAULT_PROJECT_ID } from "@zframes/spec";
import {
  UnicornScene,
  useLowEndDevice,
  useReducedMotion,
} from "@zframes/unicorn";
import { useState } from "react";

/**
 * The living Aurora backdrop — the explorer renders the SAME canvas a generated
 * board does, via the shared @zframes/unicorn loader (self-hosted engine, NOT
 * the `unicornstudio-react` npm package — see that package's header for why).
 * The engine ships at /unicornStudio.umd.mjs (copied from the runtime's
 * public/).
 *
 * The scene is purely decorative (aria-hidden) and never gates legibility: a
 * contrast scrim sits over it and every card is opaque, so text always wins even
 * if the engine fails to load. It degrades to nothing (the body's static indigo
 * gradient in globals.css shows through) on three signals:
 *   - prefers-reduced-motion: a perpetual WebGL loop IS motion — honour the OS.
 *     (The runtime deliberately keeps its spec-declared scene here; the
 *     explorer's backdrop is pure decoration, so it skips.)
 *   - low-end / metered devices: a full-screen GPU + bandwidth tax to spare.
 *   - engine or scene load failure (offline, blocked, WebGL unsupported).
 */

// The dashboard default scene: Aurora, authored at the zframes indigo (hue 242).
// The explorer's accent is the same 242, so the scene renders exactly as authored
// — no hue-rotate needed to keep the backdrop in lockstep with the card accents.
const SDK_URL = "/unicornStudio.umd.mjs";

export function UnicornBackground({
  projectId = SCENE_DEFAULT_PROJECT_ID,
  /** Scene opacity. The dashboard uses 1 (opaque cards cover it); the explorer
   *  sets hero text directly on the backdrop, so it runs a touch lower and pairs
   *  with the scrim below to stay legible. */
  opacity = 0.7,
}: {
  projectId?: string;
  opacity?: number;
}) {
  // Both gates are SSR-safe (false on the server and the hydration render, then
  // re-checked after mount) and reactive to their media-query signals (a user
  // can flip reduced-motion / reduced-data mid-session).
  const lowEnd = useLowEndDevice();
  const reducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);

  if (lowEnd || reducedMotion) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {/* The WebGL scene. Fades in once the engine is ready so there's no hard pop. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: ready ? opacity : 0,
          transition:
            "opacity 0.9s var(--zf-ease-out, cubic-bezier(0.23,1,0.32,1))",
        }}
      >
        <UnicornScene
          projectId={projectId}
          sdkUrl={SDK_URL}
          width="100vw"
          height="100vh"
          onLoad={() => setReady(true)}
        />
      </div>
    </div>
  );
}
