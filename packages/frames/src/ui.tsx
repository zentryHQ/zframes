import type { ReactNode } from "react";

/**
 * Shared loading / empty placeholder for data frames. Keeps the wording
 * per-frame ("loading TVL…", "no funding data") but the markup and theme
 * classes in one place, so every frame's idle states look identical.
 */
export function FrameStatus({
  loading = false,
  children,
}: {
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`body-sm text-soft${loading ? " animate-pulse" : ""}`}>
      {children}
    </div>
  );
}
