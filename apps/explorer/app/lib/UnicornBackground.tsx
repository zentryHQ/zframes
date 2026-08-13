"use client";

import { SCENE_DEFAULT_PROJECT_ID } from "@zframes/spec";
import {
  UnicornScene,
  useLowEndDevice,
  useReducedMotion,
} from "@zframes/unicorn";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
// at the top of the page — the scroll-driven hue drift below starts from 0deg.
const SDK_URL = "/unicornStudio.umd.mjs";

// How far the scene's hue spins over a full page scroll (242 indigo → ~332
// magenta). Keep in sync with the `unicorn-scroll-hue` keyframes in globals.css
// — the CSS scroll-timeline path and this JS fallback must land on the same
// angle or the two paths would look different per browser.
const SCROLL_HUE_DEG = 90;

// The scroll-hue drift belongs to the landing page's long narrative scroll
// alone — every other route (gallery, catalogue, dashboard, …) keeps the scene
// at its authored indigo, in lockstep with the site accent. The backdrop mounts
// once in AppShell and survives navigation, so this is a per-pathname gate, not
// a per-page mount.
const SCROLL_HUE_PATHS = new Set(["/"]);

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
  const sceneRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const scrollHue = SCROLL_HUE_PATHS.has(pathname ?? "");

  // Defer the engine (241 KB parse + WebGL context + shader compile) until the
  // page has loaded and the main thread is idle — it used to land exactly
  // during hydration and the landing's board-mount burst. The static body
  // gradient is the designed fallback, and the 900 ms fade below hides the
  // late start.
  const [deferred, setDeferred] = useState(false);
  useEffect(() => {
    let idleId = 0;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      if (typeof window.requestIdleCallback === "function")
        idleId = window.requestIdleCallback(() => setDeferred(true), {
          timeout: 2000,
        });
      else timerId = setTimeout(() => setDeferred(true), 350);
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      window.removeEventListener("load", arm);
      if (idleId) window.cancelIdleCallback?.(idleId);
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  // Scroll-hue fallback for browsers without CSS scroll timelines (Firefox):
  // rAF-throttled scroll → the same hue-rotate on the same element the CSS
  // path animates. Supporting browsers bail here — the compositor-driven
  // `.animate-unicorn-scroll-hue` animation owns the filter (and would beat an
  // inline style anyway). hue-rotate never causes layout or content repaint, so
  // the per-frame cost is one style recalc on this element.
  useEffect(() => {
    if (!scrollHue || lowEnd || reducedMotion) return;
    if (
      typeof CSS !== "undefined" &&
      CSS.supports("animation-timeline: scroll()")
    )
      return;
    const el = sceneRef.current;
    if (!el) return;
    let raf = 0;
    // scrollHeight is CACHED and refreshed only on resize/content growth: the
    // landing is ~1500vh with pending style changes from motion on most frames,
    // so reading document scrollHeight per scroll frame forced a layout each
    // time. A ResizeObserver on documentElement catches content-height changes
    // (boards mounting, sections expanding) without any per-scroll read.
    let max = 0;
    const remeasure = () => {
      max = document.documentElement.scrollHeight - window.innerHeight;
    };
    const apply = () => {
      raf = 0;
      const progress = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
      el.style.filter =
        progress > 0
          ? `hue-rotate(${(progress * SCROLL_HUE_DEG).toFixed(1)}deg)`
          : "";
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onResize = () => {
      remeasure();
      onScroll();
    };
    remeasure();
    apply();
    const ro = new ResizeObserver(onResize);
    ro.observe(document.documentElement);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      // The element survives route changes (AppShell mounts it once), so a
      // navigation away must clear the last-applied inline filter too.
      el.style.filter = "";
    };
  }, [scrollHue, lowEnd, reducedMotion]);

  if (lowEnd || reducedMotion || !deferred) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden"
    >
      {/* The WebGL scene. Fades in once the engine is ready so there's no hard pop.
          Opacity stays inline — it's a runtime prop, not a static utility. */}
      <div
        ref={sceneRef}
        className={`${scrollHue ? "animate-unicorn-scroll-hue " : ""}absolute inset-0 transition-opacity duration-[900ms] ease-[var(--zf-ease-out,cubic-bezier(0.23,1,0.32,1))]`}
        style={{ opacity: ready ? opacity : 0 }}
      >
        <UnicornScene
          projectId={projectId}
          sdkUrl={SDK_URL}
          width="100vw"
          height="100vh"
          // 30fps, matching DashboardBackground: this is the chrome backdrop
          // behind EVERY page of the site, so it is the one scene a visitor
          // always pays for. A slow drift at low opacity reads the same at half
          // the frames.
          fps={30}
          onLoad={() => setReady(true)}
        />
      </div>
    </div>
  );
}
