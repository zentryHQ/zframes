"use client";

import {
  DashboardRenderer,
  DashboardSpecSchema,
  FramesProvider,
} from "@zframes/core";
import { useMemo } from "react";
import { providers, registry } from "@/app/lib/frames";

// Read-only live render of a dashboard spec. Validates through DashboardSpecSchema
// (a bad spec shows a readable message; bad frame configs render as per-frame
// error cards inside DashboardRenderer, never fatal). Loaded client-only by its
// callers (dynamic ssr:false) since the frames use browser APIs + a shared WS.
export default function DashboardView({ spec }: { spec: unknown }) {
  // Memoized: an unmemoized parse mints a fresh `frames` array every render,
  // which invalidates DashboardRenderer's per-frame style memo and re-renders
  // every card — React.memo(FrameContent) relies on this identity being stable.
  const parsed = useMemo(() => DashboardSpecSchema.safeParse(spec), [spec]);
  if (!parsed.success) {
    return (
      <pre className="m-6 rounded-lg border border-down/40 bg-down/5 p-4 text-xs text-down whitespace-pre-wrap">
        {`Invalid dashboard spec:\n${JSON.stringify(parsed.error.issues, null, 2)}`}
      </pre>
    );
  }
  return (
    <FramesProvider providers={providers}>
      <DashboardRenderer spec={parsed.data} registry={registry} />
    </FramesProvider>
  );
}
