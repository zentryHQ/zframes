import { useEffect, useRef } from "react";

/**
 * ONE Escape stack for every dismissable surface on the page (orb, dashboard
 * chooser, config dialog, currency picker dropdown, undo toast, reader's guide,
 * …). Each surface registers a *layer* while it is open; a single window-level
 * listener hands the key to the TOPMOST layer only and consumes the event, so
 * one press closes one thing, topmost-first.
 *
 * Why a stack and not per-surface listeners: every surface used to register its
 * own `window`/`document` keydown listener, so several answered one press (orb
 * + chooser both closed) and two surfaces hand-patched around the collision
 * with `stopPropagation`. Scoping the stack once here retires those patches.
 *
 * BUBBLE phase on `window`, deliberately: an Escape handled closer to its
 * target wins by stopping propagation (a chart's marker tooltip, an open
 * listbox inside a dialog) or by `preventDefault` (Radix's document-level
 * `DismissableLayer`), and only a press nobody inside claimed reaches the stack.
 * Packages that cannot import core (charts) coordinate through exactly that
 * `stopPropagation`, so a capture-phase listener here would silently break
 * them. When no layer is registered the listener is not attached at all.
 */
type Layer = { readonly id: number; handler: () => void };

const stack: Layer[] = [];
let nextId = 1;
let attached = false;

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const top = stack[stack.length - 1];
  if (!top) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  top.handler();
}

function attach() {
  if (attached || typeof window === "undefined") return;
  window.addEventListener("keydown", onKeyDown);
  attached = true;
}

function detach() {
  if (!attached || stack.length > 0) return;
  window.removeEventListener("keydown", onKeyDown);
  attached = false;
}

/**
 * Imperative form: push a layer, get back its release. The most recently
 * pushed layer is the topmost. Release is idempotent.
 */
export function pushEscapeLayer(handler: () => void): () => void {
  const layer: Layer = { id: nextId++, handler };
  stack.push(layer);
  attach();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const index = stack.indexOf(layer);
    if (index !== -1) stack.splice(index, 1);
    detach();
  };
}

/** How many layers are currently open — for tests and for "is anything modal" checks. */
export function escapeLayerDepth(): number {
  return stack.length;
}

/**
 * Hook form: while `active`, this surface is an Escape layer that runs
 * `onEscape` when it is topmost and Escape is pressed. The handler is read
 * through a ref so re-renders never reorder the stack (only `active` toggling
 * pushes/pops), which keeps "topmost" == "most recently opened".
 */
export function useEscapeLayer(active: boolean, onEscape: () => void): void {
  const handlerRef = useRef(onEscape);
  handlerRef.current = onEscape;
  useEffect(() => {
    if (!active) return;
    return pushEscapeLayer(() => handlerRef.current());
  }, [active]);
}
