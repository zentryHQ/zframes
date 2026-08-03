import { useFramePatch } from "@zframes/core";
import { useCallback, useEffect, useState } from "react";
import { interactiveSurface } from "./content-shared";

/**
 * The on-card timeframe control, shared by every frame whose data has more than
 * one window. Adding it to a frame is two steps: call `useFrameChoice` with the
 * config field, then render `<TimeframeToggle>` where the static "past 1y"
 * caption used to sit — so the control costs no extra vertical space, it just
 * makes the label that was already there adjustable.
 *
 * Don't hand-roll a segmented control per frame; that divergence is exactly what
 * this package's shared primitives exist to prevent.
 */

/**
 * A config field a card can change in place.
 *
 * Returns the live value plus a setter that patches the frame's own instance
 * config through `useFramePatch`, so a flip persists into `dashboard.json` the
 * same way the editor rail's own fields do. Outside the editor (a bare
 * `DashboardRenderer`, Storybook) there is no patcher, so the setter falls back
 * to local state and the control still works for the session — better than a
 * dead control.
 */
export function useFrameChoice<T extends string>(
  field: string,
  configValue: T,
): [T, (next: T) => void] {
  const patch = useFramePatch();
  const [value, setValue] = useState<T>(configValue);

  // The config is still the source of truth: an edit from the rail, a spec
  // reload, or a dashboard switch must win over a stale local pick.
  useEffect(() => setValue(configValue), [configValue]);

  const choose = useCallback(
    (next: T) => {
      // Set locally too, not just via the patch: the patch round-trips through
      // the host's spec state, and the control should respond on the click.
      setValue(next);
      patch?.({ [field]: next });
    },
    [field, patch],
  );

  return [value, choose];
}

/** A compact segmented control over a frame's timeframe options. */
export function TimeframeToggle<T extends string>({
  options,
  value,
  onChange,
  className = "",
  label = "timeframe",
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
  /** Accessible group name — the visible options are bare windows like "1y". */
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex shrink-0 items-center gap-0.5 ${className}`}
    >
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            // Stop the pointer reaching GridStack, or picking a timeframe on a
            // card in the editor starts dragging the card instead.
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onChange(option)}
            className={`caption px-1.5 py-0.5 leading-none ${
              active
                ? "text-strong border-[var(--color-accent-line)] bg-white/[0.08] rounded-md border"
                : `text-soft hover:text-strong ${interactiveSurface}`
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
