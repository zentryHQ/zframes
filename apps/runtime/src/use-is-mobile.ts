import { useEffect, useState } from "react";

// Must stay in lockstep with the single-column collapse media query in
// @zframes/core's FRAME_CSS (frame-content.tsx). Same query string => the JS
// renderer swap and the CSS reflow trip at the exact same width.
const MOBILE_QUERY = "(max-width: 640px)";

export function useIsMobile() {
  // SPA (no SSR) — window is available, so seed synchronously to avoid a flash.
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}
