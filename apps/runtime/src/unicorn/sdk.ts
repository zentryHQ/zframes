// Loads the self-hosted LEGACY UnicornStudio engine (apps/runtime/public/)
// for the orb, in ISOLATION from the global `window.UnicornStudio`.
//
// Why isolated, not a shared global: the orb scene (./scenes/orb.scene.ts) is a
// hand-authored v1.4.29 export with embedded compiled shaders, and only renders
// correctly on that 1.4.x engine. The dashboard *background*, by contrast, is a
// hosted Unicorn project in the modern `layers` format (v2.x) that only the
// newer engine can read — and `unicornstudio-react` insists on finding its
// engine at `window.UnicornStudio`. The two engines can't be the same build and
// would clobber each other's global, so the orb's engine is loaded into a
// private module scope here and never touches `window.UnicornStudio`. The
// background owns the global (see background.tsx + /unicornStudio.umd.mjs).
//
// The UMD is loaded via a blob ES-module wrapper (same blob: mechanism the orb
// scene itself uses): we define module/exports in the wrapper so the UMD takes
// its CommonJS branch and populates a private object instead of the window
// global. Keyless, offline, and ships in the prebuilt bundle.

import type { UnicornStudioType } from "./types";

const LEGACY_SDK_SRC = "/unicornStudio.legacy.umd.mjs";

let loading: Promise<UnicornStudioType> | null = null;

/** Resolve the isolated legacy UnicornStudio engine (loading + evaluating once). */
export function loadUnicornSdk(): Promise<UnicornStudioType> {
  if (typeof window === "undefined" || typeof document === "undefined")
    return Promise.reject(new Error("UnicornStudio needs a browser"));
  if (loading) return loading;

  loading = (async () => {
    const umd = await fetch(LEGACY_SDK_SRC).then((r) => {
      if (!r.ok) throw new Error(`failed to load UnicornStudio (${r.status})`);
      return r.text();
    });
    // Wrap so the UMD's `typeof exports == "object" && typeof module < "u"`
    // branch fires and attaches the engine to OUR `module.exports` rather than
    // to `window.UnicornStudio`.
    const wrapped =
      "const module={exports:{}};const exports=module.exports;\n" +
      umd +
      "\nexport default module.exports;";
    const url = URL.createObjectURL(
      new Blob([wrapped], { type: "text/javascript" }),
    );
    try {
      const mod = (await import(/* @vite-ignore */ url)) as {
        default?: UnicornStudioType;
      };
      const engine = mod.default;
      if (!engine?.addScene)
        throw new Error("UnicornStudio engine missing addScene");
      return engine;
    } finally {
      URL.revokeObjectURL(url);
    }
  })();
  // Let a failed load be retried on the next call rather than caching the reject.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
