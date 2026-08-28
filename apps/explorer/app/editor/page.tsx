"use client";

import dynamic from "next/dynamic";

// The editor (GridStack) is strictly client-side — load the whole view module
// with ssr:false so DashboardEditor + the localStorage read only run in the browser.
const EditorView = dynamic(() => import("./EditorView"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-7xl px-6 py-16 text-white/55">
      Loading editor…
    </div>
  ),
});

export default function EditorPage() {
  return <EditorView />;
}
