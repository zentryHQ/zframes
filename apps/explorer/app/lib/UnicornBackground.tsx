"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The living Aurora backdrop — the explorer's port of the runtime's signature
 * dashboard background (apps/runtime/src/background.tsx + unicorn-scene.tsx),
 * so the front door renders on the SAME canvas a generated board does.
 *
 * Self-hosted engine, NOT the `unicornstudio-react` npm package: that package
 * inlines a ~1.3 MB copy of the engine even when you load it from a URL. We ship
 * the engine at /unicornStudio.umd.mjs (copied from the runtime's public/) and
 * inject it as a runtime <script> — the only bundled cost is this ~2 KB module.
 *
 * The scene is purely decorative (aria-hidden) and never gates legibility: a
 * contrast scrim sits over it and every card is opaque, so text always wins even
 * if the engine fails to load. It degrades to nothing (the body's static indigo
 * gradient in globals.css shows through) on three signals, mirroring the runtime:
 *   - prefers-reduced-motion: a perpetual WebGL loop IS motion — honour the OS.
 *   - low-end / metered devices: a full-screen GPU + bandwidth tax to spare.
 *   - engine or scene load failure (offline, blocked, WebGL unsupported).
 */

// The dashboard default scene: Aurora, authored at the zframes indigo (hue 242).
// The explorer's accent is the same 242, so the scene renders exactly as authored
// — no hue-rotate needed to keep the backdrop in lockstep with the card accents.
const AURORA_PROJECT_ID = "YrTzGatwjK7EoFpCSfgZ";
const SDK_URL = "/unicornStudio.umd.mjs";

interface UnicornSceneHandle {
  destroy?: () => void;
}
interface UnicornSceneConfig {
  elementId: string;
  projectId: string;
  scale: number;
  dpi: number;
  fps: number;
  lazyLoad: boolean;
  production: boolean;
}
declare global {
  interface Window {
    UnicornStudio?: {
      addScene: (config: UnicornSceneConfig) => Promise<UnicornSceneHandle>;
    };
  }
}

// One in-flight promise per url — the engine <script> is injected exactly once
// even across remounts / route changes.
const scriptPromises = new Map<string, Promise<void>>();
function loadSdk(url: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.UnicornStudio?.addScene) return Promise.resolve();
  const existing = scriptPromises.get(url);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const prior = document.querySelector<HTMLScriptElement>(
      `script[src="${url}"]`,
    );
    const script = prior ?? document.createElement("script");
    script.addEventListener("load", () => {
      if (window.UnicornStudio?.addScene) resolve();
      else reject(new Error("UnicornStudio global missing after load"));
    });
    script.addEventListener("error", () =>
      reject(new Error("UnicornStudio SDK failed to load")),
    );
    if (!prior) {
      script.src = url;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((err) => {
    scriptPromises.delete(url);
    throw err;
  });
  scriptPromises.set(url, promise);
  return promise;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const REDUCED_DATA = "(prefers-reduced-data: reduce)";
const SMALL_TOUCH = "(pointer: coarse) and (max-width: 768px)";

interface CapabilityNavigator extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

// True when we should skip the WebGL scene entirely (see the file header). Mirrors
// the runtime's useLowEndDevice + a reduced-motion gate. A missing navigator hint
// counts as capable, so Firefox/Safari never downgrade on hardware guesses alone.
function shouldSkipScene(): boolean {
  if (typeof window === "undefined") return true;
  if (window.matchMedia(REDUCED_MOTION).matches) return true;
  if (window.matchMedia(REDUCED_DATA).matches) return true;
  if (window.matchMedia(SMALL_TOUCH).matches) return true;
  const nav = navigator as CapabilityNavigator;
  if (nav.connection?.saveData) return true;
  if ((nav.deviceMemory ?? 8) <= 4) return true;
  if ((nav.hardwareConcurrency ?? 8) <= 4) return true;
  return false;
}

let sceneSeq = 0;

export function UnicornBackground({
  projectId = AURORA_PROJECT_ID,
  /** Scene opacity. The dashboard uses 1 (opaque cards cover it); the explorer
   *  sets hero text directly on the backdrop, so it runs a touch lower and pairs
   *  with the scrim below to stay legible. */
  opacity = 0.7,
}: {
  projectId?: string;
  opacity?: number;
}) {
  // Seed false on the server AND first client render so SSR markup matches, then
  // decide after mount (the media/navigator signals only exist client-side).
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  // Decide whether to run the scene, and stay reactive to the media-query signals
  // (a user can flip reduced-motion / reduced-data mid-session).
  useEffect(() => {
    const decide = () => setEnabled(!shouldSkipScene());
    decide();
    const queries = [
      window.matchMedia(REDUCED_MOTION),
      window.matchMedia(REDUCED_DATA),
      window.matchMedia(SMALL_TOUCH),
    ];
    for (const q of queries) q.addEventListener("change", decide);
    return () => {
      for (const q of queries) q.removeEventListener("change", decide);
    };
  }, []);

  // Inject the engine once we're enabled.
  useEffect(() => {
    if (!enabled) return;
    let ignore = false;
    loadSdk(SDK_URL)
      .then(() => !ignore && setReady(true))
      .catch(() => !ignore && setReady(false));
    return () => {
      ignore = true;
    };
  }, [enabled]);

  // Mount the scene into the target div; tear it down on unmount / scene swap.
  useEffect(() => {
    const el = elementRef.current;
    if (!enabled || !ready || !el || !window.UnicornStudio?.addScene) return;
    if (!el.id) el.id = `zf-explorer-unicorn-${(sceneSeq += 1)}`;
    let scene: UnicornSceneHandle | null = null;
    let ignore = false;
    window.UnicornStudio.addScene({
      elementId: el.id,
      projectId,
      scale: 1,
      dpi: 1.5,
      fps: 60,
      lazyLoad: true,
      production: true,
    })
      .then((s) => {
        if (ignore) {
          s?.destroy?.();
          return;
        }
        scene = s;
      })
      .catch(() => {
        // Bad projectId / WebGL unsupported — degrade silently to the gradient.
      });
    return () => {
      ignore = true;
      scene?.destroy?.();
    };
  }, [enabled, ready, projectId]);

  if (!enabled) return null;

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
        ref={elementRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100vw",
          height: "100vh",
          opacity: ready ? opacity : 0,
          transition: "opacity 0.9s var(--zf-ease-out, cubic-bezier(0.23,1,0.32,1))",
        }}
      />
    </div>
  );
}
