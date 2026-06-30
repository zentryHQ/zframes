import { useEffect, useState } from "react";

// Editing (GridStack drag/resize) is a desktop activity — the editor is heavy
// and awkward on touch — so it's gated to desktop widths. Everything narrower
// gets the read-only DashboardRenderer, which reflows on its own through CSS
// (single column <=640px, two columns 641-1023px; see FRAME_CSS in
// @zframes/core). This query ONLY decides renderer-vs-editor; it's deliberately
// distinct from those CSS reflow breakpoints, which need no JS.
const DESKTOP_QUERY = "(min-width: 1024px)";

export function useIsDesktop() {
  // SPA (no SSR) — window is available, so seed synchronously to avoid a flash.
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia(DESKTOP_QUERY).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}
