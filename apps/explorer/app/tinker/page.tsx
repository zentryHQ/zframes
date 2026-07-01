"use client";

import dynamic from "next/dynamic";

// The editor (GridStack) is strictly client-side — load the whole tinker module
// with ssr:false so DashboardEditor + the localStorage read only run in the browser.
const DashboardTinker = dynamic(() => import("./DashboardTinker"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-7xl px-6 py-16 text-white/40">Loading editor…</div>
  ),
});

export default function TinkerPage() {
  return <DashboardTinker />;
}
