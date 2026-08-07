import type { ReactNode } from "react";

/**
 * Shared scroll-area styling for list/feed frames: claims the remaining height,
 * scrolls vertically, and renders a thin, quiet scrollbar that brightens on
 * hover (webkit). `pr-1` keeps row content off the scrollbar track so the last
 * column never sits under the thumb.
 */
export const scrollAreaClass =
  "min-h-0 flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/[0.08] hover:[&::-webkit-scrollbar-thumb]:bg-white/15";

/**
 * Horizontal counterpart to {@link scrollAreaClass} for strips that scroll on
 * the x-axis (e.g. a row of projected-block / candle tiles). Same quiet, thin
 * thumb that brightens on hover; `pb-1` keeps content off the scrollbar track.
 */
export const scrollAreaXClass =
  "min-w-0 overflow-x-auto pb-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/[0.08] hover:[&::-webkit-scrollbar-thumb]:bg-white/15";

/**
 * Shared loading / empty placeholder for frames. Loading gets a real widget
 * skeleton instead of text-only pulse; empty states stay quiet and readable.
 */
export function FrameStatus({
  loading = false,
  children,
}: {
  loading?: boolean;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div
        className="flex h-full min-h-[72px] w-full items-center justify-center overflow-hidden rounded-md"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex w-full max-w-sm flex-col gap-3">
          <div className="flex items-center gap-2">
            <span
              className="relative h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                background: "hsl(var(--zf-accent-hue, 242) 90% 76%)",
                boxShadow:
                  "0 0 12px hsl(var(--zf-accent-hue, 242) 90% 76% / 0.72)",
              }}
            >
              <span
                className="absolute inset-0 animate-ping rounded-full opacity-60"
                style={{
                  background: "hsl(var(--zf-accent-hue, 242) 90% 76%)",
                }}
              />
            </span>
            <span className="body-sm text-soft truncate">{children}</span>
          </div>
          <div className="grid min-h-0 grid-cols-4 gap-2">
            <span className="h-11 animate-pulse rounded bg-white/[0.07]" />
            <span className="h-11 animate-pulse rounded bg-white/[0.05]" />
            <span className="h-11 animate-pulse rounded bg-white/[0.08]" />
            <span className="h-11 animate-pulse rounded bg-white/[0.04]" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="h-2.5 w-11/12 animate-pulse rounded-full bg-white/[0.07]" />
            <span className="h-2.5 w-7/12 animate-pulse rounded-full bg-white/[0.05]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="body-sm text-soft flex h-full min-h-0 items-center justify-center text-center"
      // MACHINE-READABLE EMPTY STATE. A frame that has resolved with no data is
      // NOT `aria-busy` — it looks finished to anything watching the DOM. The
      // nightly thumbnail capture waited only for busy states to clear and so
      // photographed boards mid-warm-up, publishing a shot full of "no history
      // yet" cards; `apps/explorer/scripts/capture-thumbs.ts` now waits on this
      // attribute and refuses to overwrite a good thumb with such a shot.
      //
      // It is deliberately NOT `role="status"`/`aria-busy` — those would lie to
      // a screen reader about work still being in progress.
      data-zf-empty="true"
    >
      {children}
    </div>
  );
}
