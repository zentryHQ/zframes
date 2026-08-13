import { lazy } from "react";
import type { AnyFrameDefinition, FrameRegistry } from "@zframes/core";
import { frameLoaders } from "./lazy";
import { allFrameMetas } from "./schemas";

/** Fallback for a frame flagged with a title slot but exporting none. */
const NullSlot = () => null;

/**
 * Per-registry chunk getters, so a host can warm a frame's chunk *before* the
 * frame renders. The getter is the same memoized one `React.lazy` resolves
 * through, so a prefetch followed by a render costs one fetch, not two.
 */
const chunkGetters = new WeakMap<
  FrameRegistry,
  Map<string, () => Promise<AnyFrameDefinition>>
>();

/**
 * Start loading the chunks for `names` without rendering them. Best-effort:
 * unknown names are skipped and a rejected import is swallowed here (the
 * getter clears its memo, so the real render retries).
 */
export function prefetchFrames(
  registry: FrameRegistry,
  names: Iterable<string>,
): void {
  const getters = chunkGetters.get(registry);
  if (!getters) return;
  for (const name of names) {
    const get = getters.get(name);
    if (get) void get().catch(() => {});
  }
}

/**
 * Build a frame registry with **lazily-loaded** components.
 *
 * Iterates `allFrameMetas` — the FULL metadata set (the React-free twin of
 * `allFrames`), NOT the curated `frameMetas` AI catalogue. A host must render
 * every frame a human can add from the editor palette or that a saved spec
 * references; building from the curated catalogue would silently drop the
 * games/journal/tools/layout frames and surface them as "Unknown frame" cards.
 *
 * The registry carries the full meta eagerly (schema, capabilities, category,
 * layout, source) so config validation, missing-capability checks, error
 * cards, and the editor palette all work without downloading any component
 * code. Only `component` (and the optional `titleIcon` / `titleContent`) are
 * deferred behind `React.lazy`, resolved from a per-frame chunk the first time
 * the frame renders. `FrameContent` renders these through a `<Suspense>`
 * boundary.
 */
export function createLazyRegistry(): FrameRegistry {
  const registry: FrameRegistry = new Map();
  const getters = new Map<string, () => Promise<AnyFrameDefinition>>();
  chunkGetters.set(registry, getters);
  for (const meta of allFrameMetas) {
    const loader = frameLoaders[meta.name];
    if (!loader) {
      // A frame with metadata but no loader can't render — surface it loudly.
      // (The reverse — a loader with no meta — is caught by the parity test in
      // packages/frames, since this loop never reaches such an entry.)
      console.warn(
        `[zframes] frame "${meta.name}" has metadata but no lazy loader — it won't render`,
      );
      continue;
    }
    // Share one import promise between the component and its title icon so the
    // pair resolves from a single chunk fetch. Clear the memo if the import
    // rejects so a later remount retries instead of reusing a rejected promise.
    // (React.lazy also caches a rejection on the component itself, so fully
    // recovering from a failed chunk fetch still needs a page reload.)
    let pending: Promise<AnyFrameDefinition> | null = null;
    const get = () =>
      (pending ??= loader.load().catch((err) => {
        pending = null;
        throw err;
      }));
    getters.set(meta.name, get);
    const component = lazy(() =>
      get().then((def) => ({ default: def.component })),
    );
    const titleIcon = loader.titleIcon
      ? lazy(() =>
          get().then((def) => {
            if (!def.titleIcon) {
              console.warn(
                `[zframes] frame "${meta.name}" is flagged titleIcon but its module exports none`,
              );
            }
            return { default: def.titleIcon ?? NullSlot };
          }),
        )
      : undefined;
    const titleContent = loader.titleContent
      ? lazy(() =>
          get().then((def) => {
            if (!def.titleContent) {
              console.warn(
                `[zframes] frame "${meta.name}" is flagged titleContent but its module exports none`,
              );
            }
            return { default: def.titleContent ?? NullSlot };
          }),
        )
      : undefined;
    registry.set(meta.name, {
      ...meta,
      component,
      titleIcon,
      titleContent,
    } as AnyFrameDefinition);
  }
  return registry;
}
