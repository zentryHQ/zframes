"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as d3 from "d3";

import type { ChartEvent } from "../types";

/**
 * Dated annotations on the time axis: a dashed rule where something happened,
 * a flag on the top edge, and a hover/focus tooltip with the detail. Lets a
 * reader line a move up against its cause ("the cut is where TVL turned")
 * instead of eyeballing two charts side by side.
 *
 * An HTML layer over the SVG rather than more D3: the tooltip is real markup
 * (a link, wrapped prose, a keyboard-focusable target), and pointer-events stay
 * off everywhere except the flags themselves, so the D3 crosshair underneath
 * keeps the whole plot area to itself.
 */

/** Flags closer together than this collapse into one, to keep the axis legible. */
const CLUSTER_PX = 18;
const TOOLTIP_WIDTH = 224;
/** Rough advance width of the 9px inline label, for the overlap check. */
const LABEL_CHAR_PX = 5.2;
const LABEL_MAX_CHARS = 18;
/** Below this the card is too narrow for inline labels; the tooltip carries them. */
const INLINE_LABEL_MIN_WIDTH = 460;

interface EventCluster {
  /** Plot-space x of the first event in the cluster. */
  x: number;
  events: ChartEvent[];
  color: string;
  /** Inline label text, or null when it would collide / not fit. */
  inlineLabel: string | null;
}

const formatEventDate = (date: Date): string =>
  date.getHours() === 0 && date.getMinutes() === 0
    ? d3.timeFormat("%b %d, %Y")(date)
    : d3.timeFormat("%b %d, %Y %H:%M")(date);

export interface EventLayerProps {
  events: ChartEvent[];
  xScale: d3.ScaleTime<number, number, never>;
  /** Plot origin inside the container — the chart's dynamic left margin / top margin. */
  offsetX: number;
  offsetY: number;
  innerWidth: number;
  innerHeight: number;
  containerWidth: number;
}

export const EventLayer: React.FC<EventLayerProps> = ({
  events,
  xScale,
  offsetX,
  offsetY,
  innerWidth,
  innerHeight,
  containerWidth,
}) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // Hover intent: the pointer has to cross a few pixels of gap between the flag
  // and the tooltip, so closing on `pointerleave` alone would snatch the tooltip
  // away before a link inside it could ever be clicked.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const open = useCallback((index: number) => {
    cancelClose();
    setOpenIndex(index);
  }, []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenIndex(null), 140);
  }, []);
  useEffect(() => cancelClose, []);

  const clusters = useMemo<EventCluster[]>(() => {
    const placed = events
      .map((event) => ({ event, x: xScale(event.date) }))
      // Events outside the loaded window simply aren't drawn — a chart showing
      // 90 days shouldn't sprout a flag for something from 2019.
      .filter(
        ({ x }) => Number.isFinite(x) && x >= -0.5 && x <= innerWidth + 0.5,
      )
      .sort((a, b) => a.x - b.x);

    const grouped: EventCluster[] = [];
    for (const { event, x } of placed) {
      const last = grouped[grouped.length - 1];
      if (last && x - last.x < CLUSTER_PX) {
        last.events.push(event);
        continue;
      }
      grouped.push({
        x,
        events: [event],
        color: event.color ?? "var(--color-accent-line, #8b93ff)",
        inlineLabel: null,
      });
    }

    // Inline labels are opportunistic: place one only where it clears the
    // previous label, so a busy stretch degrades to bare flags instead of mush.
    if (containerWidth >= INLINE_LABEL_MIN_WIDTH) {
      let lastRight = -Infinity;
      for (const cluster of grouped) {
        const text =
          cluster.events.length > 1
            ? `${cluster.events.length} events`
            : cluster.events[0].label.slice(0, LABEL_MAX_CHARS);
        const halfWidth = (text.length * LABEL_CHAR_PX) / 2;
        if (cluster.x - halfWidth < lastRight + 6) continue;
        cluster.inlineLabel = text;
        lastRight = cluster.x + halfWidth;
      }
    }

    return grouped;
  }, [events, xScale, innerWidth, containerWidth]);

  if (clusters.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30"
      data-chart-event-layer
    >
      {clusters.map((cluster, index) => {
        const left = offsetX + cluster.x;
        const isOpen = openIndex === index;
        const tooltipLeft = Math.max(
          4,
          Math.min(
            left - TOOLTIP_WIDTH / 2,
            containerWidth - TOOLTIP_WIDTH - 4,
          ),
        );

        return (
          <React.Fragment key={`${cluster.x}-${cluster.events[0].label}`}>
            <div
              aria-hidden
              className="absolute transition-opacity duration-150"
              style={{
                left,
                top: offsetY,
                height: innerHeight,
                borderLeft: `1px dashed ${cluster.color}`,
                opacity: isOpen ? 0.85 : 0.4,
              }}
            />

            {cluster.inlineLabel && (
              <div
                aria-hidden
                className="absolute -translate-x-1/2 whitespace-nowrap text-[9px] font-medium"
                style={{
                  left,
                  top: Math.max(0, offsetY - 17),
                  color: cluster.color,
                  opacity: isOpen ? 1 : 0.75,
                }}
              >
                {cluster.inlineLabel}
              </div>
            )}

            <button
              type="button"
              className="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full p-1.5 focus:outline-none"
              style={{ left, top: offsetY }}
              aria-label={cluster.events
                .map((e) => `${formatEventDate(e.date)}: ${e.label}`)
                .join("; ")}
              aria-expanded={isOpen}
              onPointerEnter={() => open(index)}
              onPointerLeave={scheduleClose}
              onFocus={() => open(index)}
              onBlur={scheduleClose}
              onClick={() => (isOpen ? setOpenIndex(null) : open(index))}
            >
              <span
                className="block rounded-full ring-1 ring-black/40 transition-transform duration-150"
                style={{
                  backgroundColor: cluster.color,
                  width: cluster.events.length > 1 ? 9 : 7,
                  height: cluster.events.length > 1 ? 9 : 7,
                  transform: isOpen ? "scale(1.35)" : "scale(1)",
                }}
              />
            </button>

            {isOpen && (
              <div
                role="tooltip"
                className="bg-background-terminal pointer-events-auto absolute z-40 rounded-md px-3 py-2 shadow-lg ring-1 ring-white/10"
                style={{
                  left: tooltipLeft,
                  // Butted against the flag's hit area, so the pointer never
                  // crosses dead space on its way to a link inside.
                  top: offsetY + 9,
                  width: TOOLTIP_WIDTH,
                  // A cluster listing several events must stay reachable/scannable
                  // without covering the whole plot.
                  maxHeight: Math.max(96, innerHeight - 20),
                  overflowY: "auto",
                }}
                onPointerEnter={() => open(index)}
                onPointerLeave={scheduleClose}
              >
                <div className="flex flex-col gap-2">
                  {cluster.events.map((event, eventIndex) => (
                    <div
                      key={`${event.date.getTime()}-${event.label}-${eventIndex}`}
                      className="flex flex-col gap-0.5"
                    >
                      <span className="caption text-soft">
                        {formatEventDate(event.date)}
                      </span>
                      <span className="body-sm text-strong font-bold">
                        {event.label}
                      </span>
                      {event.note && (
                        <span className="caption text-normal leading-snug">
                          {event.note}
                        </span>
                      )}
                      {event.url && (
                        <a
                          href={event.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="caption text-highlight underline underline-offset-2"
                        >
                          source
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
