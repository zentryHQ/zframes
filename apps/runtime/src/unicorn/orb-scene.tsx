import { useEffect, useId, useRef } from "react";
import { loadUnicornSdk } from "./sdk";
import { orbScene } from "./scenes/orb.scene";
import type { UnicornSceneType } from "./types";

// The WebGL orb. Ports Nexus's lib/unicorn RendererElement (Zentry IP), trimmed
// to the single embedded `orbScene`: the scene JSON is wrapped in a blob: URL
// (see ./scenes/scene.ts) and handed to the engine's addScene, so there is no
// hosted projectId and nothing to fetch — fully keyless. The live `scene` is
// handed back via `onScene` so the host can mutate the effect layer's speed
// (faster while thinking). `onError` lets the host fall back to the CSS orb.
//
// The orb runs on the ISOLATED legacy engine (loadUnicornSdk) — its v1.4.29
// scene only renders on that build, and the modern engine the dashboard
// background uses lives separately on window.UnicornStudio. See ./sdk.ts.

export function OrbCanvas({
  className,
  dpi = 2,
  scale = 1,
  // 30, not the engine's 60: this scene runs from first paint for the whole
  // session whether or not the orb is ever opened, so it is a permanent idle
  // cost paid by every dashboard. The orb is a slow swirl inside a ~56px
  // circle — there is no motion in it that reads differently at 30fps, and
  // halving the frames halves the wakeups. dpi stays at 2 so it keeps its
  // crispness on a Retina display; the pixel count is trivial at this size,
  // it's the per-frame loop that costs.
  fps = 30,
  onScene,
  onError,
}: {
  className?: string;
  dpi?: number;
  scale?: number;
  fps?: number;
  onScene: (scene: UnicornSceneType | null) => void;
  onError: () => void;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const uniqueId = useId();

  useEffect(() => {
    if (!elementRef.current) return;

    // No "already started" ref-guard: under StrictMode the effect mounts,
    // cleans up, then mounts again — a one-shot guard would skip the real
    // second mount. The `cancelled` flag makes the discarded first run tear
    // its scene down instead (standard StrictMode-safe pattern).
    let cancelled = false;
    let scenePromise: Promise<UnicornSceneType> | null = null;
    let live: UnicornSceneType | null = null;

    // Stop drawing while the tab is hidden — same reasoning as the dashboard
    // backdrop (see @zframes/unicorn's scene.tsx), and it matters a little more
    // here because this is the SECOND WebGL engine on the page: the orb runs on
    // the isolated legacy build, so nothing the backdrop does covers it.
    const syncPaused = () => {
      if (live) live.paused = document.hidden;
    };

    void (async () => {
      try {
        const UnicornStudio = await loadUnicornSdk();
        if (cancelled || !elementRef.current) return;
        elementRef.current.setAttribute("data-us-project-src", orbScene.url);
        scenePromise = UnicornStudio.addScene({
          filePath: orbScene.url,
          elementId: uniqueId,
          dpi,
          scale,
          fps,
        });
        const scene = await scenePromise;
        if (cancelled) {
          scene.destroy();
          return;
        }
        live = scene;
        // The tab can go hidden while the engine loads, with no further
        // visibilitychange to follow — apply the current state on arrival.
        syncPaused();
        onScene(scene);
      } catch {
        if (!cancelled) onError();
      }
    })();

    document.addEventListener("visibilitychange", syncPaused);

    return () => {
      cancelled = true;
      live = null;
      document.removeEventListener("visibilitychange", syncPaused);
      onScene(null);
      scenePromise?.then((scene) => scene.destroy()).catch(() => {});
    };
    // onScene/onError are memoized by the host; deps kept minimal so the scene
    // initializes once and tears down only on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueId, dpi, scale, fps]);

  return (
    <div
      ref={elementRef}
      id={uniqueId}
      className={className}
      role="img"
      aria-hidden
    />
  );
}
