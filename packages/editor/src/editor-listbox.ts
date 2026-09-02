import { useEffect, useState, type KeyboardEvent, type RefObject } from "react";

/**
 * The active-row half of a combobox: an index into the rendered row list, plus
 * the key contract that moves it — ↑/↓ with wraparound, Home, End.
 *
 * Shared because the two had already drifted: the currency picker implemented
 * the whole contract while the symbol combobox one field above it implemented
 * none of it, so two adjacent controls announcing the same role answered
 * different keys. The ROWS stay the caller's business — each list has its own
 * pseudo-rows ("Inherit board", a free-typed symbol) — and this owns only which
 * one is active.
 *
 * Focus never moves to a row: the active one is published as
 * `aria-activedescendant` on the input, so typing is never interrupted.
 */
export function useActiveRow(
  total: number,
  /** A new value lands the highlight back on the best match — the query. */
  resetKey: string,
  /** The scroll container, so the highlight stays visible while arrowing. */
  listRef?: RefObject<HTMLElement | null>,
) {
  const [index, setIndex] = useState(0);

  // A fresh query invalidates the highlight; land it on the best match so Enter
  // picks what the list shows first.
  useEffect(() => setIndex(0), [resetKey]);

  // A list that shrinks under the highlight — the symbol universe finishing its
  // load, a row being removed — must not leave it pointing past the end.
  const active = total > 0 ? Math.min(index, total - 1) : 0;

  // Keep the active row visible while arrowing through a few hundred of them.
  useEffect(() => {
    const row = listRef?.current?.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    // Guarded: jsdom has no scrollIntoView, and scrolling is a nicety — it must
    // never be what breaks the control.
    row?.scrollIntoView?.({ block: "nearest" });
  }, [active, listRef]);

  /** Handles ↑/↓/Home/End; returns true when the key was one of them. */
  const onNavKeyDown = (event: KeyboardEvent): boolean => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (total === 0) return true;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setIndex((prev) => (Math.min(prev, total - 1) + step + total) % total);
      return true;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setIndex(event.key === "Home" ? 0 : Math.max(total - 1, 0));
      return true;
    }
    return false;
  };

  return { active, setActive: setIndex, onNavKeyDown };
}
