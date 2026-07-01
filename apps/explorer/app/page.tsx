"use client";

import dynamic from "next/dynamic";

// Render the dashboard client-only (ssr: false). The frames use browser APIs
// (Date/requestAnimationFrame, canvas via liveline, WebSocket in data frames),
// so skipping SSR mirrors how the real explorer would mount a live preview and
// sidesteps "window is not defined" during server render.
const Dashboard = dynamic(() => import("./dashboard"), { ssr: false });

export default function Page() {
  return <Dashboard />;
}
