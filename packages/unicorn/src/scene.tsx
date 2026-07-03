import { useEffect, useRef, useState } from "react";

/**
 * Minimal in-house replacement for the `unicornstudio-react` package, shared by
 * every zframes host (runtime background, explorer front door).
 *
 * Why not the npm package: it inlines a full ~1.3 MB copy of the Unicorn Studio
 * WebGL engine as a string (its `loadBundledSdk` fallback) directly in the
 * module, so the bundler ships it even though we always load the engine from a
 * URL (`sdkUrl`) — each host self-hosts it at `/unicornStudio.umd.mjs` and never
 * touches the bundled copy. That dead ~1.3 MB (≈257 kB gzip) rode along in a
 * lazy chunk. This loads ONLY the hosted engine (via a runtime <script>, never
 * bundled) and drives `window.UnicornStudio.addScene` directly — the exact
 * contract the package used, minus the embedded engine.
 *
 * Scope: replicates only what the hosts need. A host remounts on a
 * `key={projectId}` change, so there's no live scene-swap logic here; a
 * scale/dpi change re-inits via the effect deps, matching the package. SSR-safe:
 * on the server this renders an empty div and touches no browser global.
 */

interface UnicornSceneConfig {
  elementId: string;
  projectId: string;
  scale: number;
  dpi: number;
  fps: number;
  lazyLoad: boolean;
  production: boolean;
}

interface UnicornSceneHandle {
  destroy?: () => void;
  resize?: () => void;
}

declare global {
  interface Window {
    UnicornStudio?: {
      addScene: (config: UnicornSceneConfig) => Promise<UnicornSceneHandle>;
    };
  }
}

// One in-flight promise per SDK url — every scene shares it, so the engine
// <script> is injected exactly once even with multiple/remounting scenes.
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
    const onLoad = () => {
      if (window.UnicornStudio?.addScene) resolve();
      else reject(new Error("UnicornStudio global missing after script load"));
    };
    script.addEventListener("load", onLoad);
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

let sceneSeq = 0;

interface UnicornSceneProps {
  projectId: string;
  sdkUrl: string;
  width?: string | number;
  height?: string | number;
  /** Render scale 0.25–1.0 (engine default 1). */
  scale?: number;
  /** Device pixel ratio (engine default 1.5). */
  dpi?: number;
  /**
   * Fires once the engine is loaded and the scene is about to mount — hosts
   * that fade the backdrop in (the explorer) key their opacity off this.
   */
  onLoad?: () => void;
}

/**
 * Mounts a Unicorn Studio scene into a full-bleed div. Loads the self-hosted
 * engine once, then `addScene` on mount and `scene.destroy()` on unmount.
 *
 * Default export so hosts can keep lazy-loading it as a drop-in scene component
 * (`lazy(() => import("@zframes/unicorn/scene"))`); the host renders it inside
 * its own Suspense boundary.
 */
export default function UnicornScene({
  projectId,
  sdkUrl,
  width = "100%",
  height = "100%",
  scale,
  dpi,
  onLoad,
}: UnicornSceneProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(
    typeof window !== "undefined" && Boolean(window.UnicornStudio?.addScene),
  );
  // Ref-held so a new callback identity never re-runs the load effect.
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  useEffect(() => {
    let ignore = false;
    loadSdk(sdkUrl)
      .then(() => {
        if (ignore) return;
        setLoaded(true);
        onLoadRef.current?.();
      })
      .catch(() => {
        // Engine failed to load (offline, blocked) — leave `loaded` false so
        // nothing renders here and the host's static fallback shows through.
        if (!ignore) setLoaded(false);
      });
    return () => {
      ignore = true;
    };
  }, [sdkUrl]);

  useEffect(() => {
    const el = elementRef.current;
    if (!loaded || !el || !window.UnicornStudio?.addScene) return;
    if (!el.id) el.id = `zf-unicorn-${(sceneSeq += 1)}`;
    let scene: UnicornSceneHandle | null = null;
    let ignore = false;
    window.UnicornStudio.addScene({
      elementId: el.id,
      projectId,
      scale: scale ?? 1,
      dpi: dpi ?? 1.5,
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
        // addScene failed (bad projectId, WebGL unsupported) — degrade silently.
      });
    return () => {
      ignore = true;
      scene?.destroy?.();
    };
  }, [loaded, projectId, scale, dpi]);

  return (
    <div
      ref={elementRef}
      aria-hidden
      style={{
        position: "relative",
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
    />
  );
}
