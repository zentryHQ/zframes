import { BarChart, MiniLineChart } from "@zframes/charts";
import { defineFrame } from "@zframes/core";
import { useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import {
  clampText,
  extractByPath,
  MAX_BODY_CHARS,
  numericCells,
  toCells,
  validateCustomUrl,
} from "./custom-data-shared";
import { formatCompact } from "./format";
import { MetricRow } from "./metric-row";
import { customDataMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = customDataMeta.schema;
type Config = z.output<typeof schema>;

/**
 * Fetch the endpoint browser-direct with hard rails: the URL is re-validated
 * at call time (defense in depth vs. the schema refine), credentials are never
 * sent, redirects that land off-https are rejected by the browser itself, the
 * body is size-capped before parsing, and the request aborts after 10 s.
 * Deliberately NEVER routed through the runtime's server-side proxy — a spec
 * author must not be able to make the local Node relay fetch on their behalf.
 */
async function fetchCustomJson(url: string): Promise<unknown> {
  const invalid = validateCustomUrl(url);
  if (invalid) throw new Error(invalid);
  const res = await fetch(url, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BODY_CHARS) throw new Error("response too large");
  return JSON.parse(text) as unknown;
}

interface Extracted {
  cells: Array<number | string>;
  labels: string[];
}

function useCustomData(config: Config) {
  const [body, setBody] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);
    const load = () => {
      fetchCustomJson(config.url)
        .then((json) => {
          if (cancelled) return;
          setBody(json);
          setError(null);
          setLoaded(true);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "fetch failed");
          setLoaded(true);
        });
    };
    load();
    const id = window.setInterval(load, config.refreshMinutes * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [config.url, config.refreshMinutes]);

  const extracted: Extracted | { pathError: string } | null = useMemo(() => {
    if (body === undefined) return null;
    try {
      const raw = extractByPath(body, config.values);
      // An unresolved path means "matched nothing", not a "—" cell.
      const cells = raw === undefined ? [] : toCells(raw);
      let labels: string[] = [];
      if (config.labels) {
        labels = toCells(extractByPath(body, config.labels)).map((c) =>
          clampText(String(c)),
        );
      }
      return { cells, labels };
    } catch (err) {
      return {
        pathError: err instanceof Error ? err.message : "bad path",
      };
    }
  }, [body, config.values, config.labels]);

  return { extracted, error, loaded };
}

/** Format a numeric cell for display, with the configured unit appended. */
function formatCell(value: number | string, unit: string): string {
  if (typeof value !== "number") return String(value);
  const formatted =
    Math.abs(value) >= 10_000
      ? formatCompact(value)
      : Number.isInteger(value)
        ? String(value)
        : value.toFixed(2);
  return unit ? `${formatted}${unit}` : formatted;
}

/**
 * MiniLineChart scales x by parsed Date, so positional series need uniform
 * synthetic timestamps — String(i) would parse as scattered years.
 */
function toSeries(numbers: number[]): Array<{ date: string; value: number }> {
  return numbers.map((value, i) => ({
    date: new Date(i * 60_000).toISOString(),
    value,
  }));
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * MiniLineChart draws at a fixed pixel width/height, so the chart displays
 * measure their slot and hand it real dimensions — otherwise the line ends
 * mid-card on wide frames (a CSS `w-full` stretches the viewport, not the
 * drawing).
 */
function useMeasure<T extends HTMLElement>() {
  // Callback ref, not a ref object: the measured div mounts long after the
  // component does (loading state renders first), so a mount-time effect
  // would observe nothing.
  const [node, setNode] = useState<T | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setSize((prev) => {
        const next = { w: Math.round(rect.width), h: Math.round(rect.height) };
        return prev && prev.w === next.w && prev.h === next.h ? prev : next;
      });
    };
    update();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(update)
        : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [node]);
  return { ref: setNode, size };
}

/** Accent-reactive series stroke — matches the base charts' default. */
const LINE_COLOR = "var(--color-highlight, #8b8bff)";

/** "H 35°C · L 27.9°C" range readout for a numeric series. */
function RangeReadout({ numbers, unit }: { numbers: number[]; unit: string }) {
  if (numbers.length < 2) return null;
  const hi = Math.max(...numbers);
  const lo = Math.min(...numbers);
  return (
    <span className="caption text-soft shrink-0 tabular-nums">
      H {formatCell(hi, unit)} · L {formatCell(lo, unit)}
    </span>
  );
}

function Caption({ config }: { config: Config }) {
  const host = hostOf(config.url);
  return (
    <div className="caption text-soft flex items-baseline justify-between gap-2">
      <span className="truncate">{config.label || host}</span>
      {config.label && host && (
        <span className="truncate opacity-70">{host}</span>
      )}
    </div>
  );
}

function CustomData({ config }: { config: Config }) {
  const { extracted, error, loaded } = useCustomData(config);
  const { ref: chartRef, size: chartSize } = useMeasure<HTMLDivElement>();

  if (!loaded && extracted === null)
    return <FrameStatus loading>fetching {hostOf(config.url)}…</FrameStatus>;
  if (error) return <FrameStatus>fetch failed — {clampText(error)}</FrameStatus>;
  if (extracted === null || "pathError" in extracted)
    return (
      <FrameStatus>
        path error —{" "}
        {extracted && "pathError" in extracted ? extracted.pathError : "no data"}
      </FrameStatus>
    );

  const { cells, labels } = extracted;
  if (cells.length === 0)
    return <FrameStatus>path matched nothing in the response</FrameStatus>;

  const numbers = numericCells(cells);

  if (config.display === "stat") {
    const last = cells[cells.length - 1];
    const spark = toSeries(numbers);
    return (
      <div className="flex h-full min-h-0 flex-col justify-center gap-2">
        <Caption config={config} />
        <div className="flex items-baseline justify-between gap-3">
          <div className="metric-xl text-strong leading-none">
            {formatCell(last, config.unit)}
          </div>
          <RangeReadout numbers={numbers} unit={config.unit} />
        </div>
        {spark.length > 1 && (
          <div ref={chartRef} className="min-h-[36px] w-full">
            {chartSize && (
              <MiniLineChart
                data={spark}
                width={chartSize.w}
                height={44}
                color={LINE_COLOR}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  if (config.display === "line") {
    if (numbers.length < 2)
      return <FrameStatus>need a numeric series for a line chart</FrameStatus>;
    const data = toSeries(numbers);
    const current = numbers[numbers.length - 1];
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <div className="metric-lg text-strong leading-none">
            {formatCell(current, config.unit)}
          </div>
          <RangeReadout numbers={numbers} unit={config.unit} />
        </div>
        <div ref={chartRef} className="min-h-0 w-full flex-1">
          {chartSize && (
            <MiniLineChart
              data={data}
              width={chartSize.w}
              height={Math.max(chartSize.h, 48)}
              color={LINE_COLOR}
            />
          )}
        </div>
        <Caption config={config} />
      </div>
    );
  }

  if (config.display === "bars") {
    if (numbers.length === 0)
      return <FrameStatus>need numeric values for a bar chart</FrameStatus>;
    const data = numbers.map((value, i) => ({
      label: labels[i] ?? String(i + 1),
      value,
    }));
    return (
      <div className="flex h-full min-h-0 flex-col justify-center gap-1">
        <BarChart
          data={data.slice(0, 40)}
          orientation={data.length > 12 ? "vertical" : "horizontal"}
          height={Math.max(Math.min(data.length, 12) * 24, 96)}
          formatValue={(v) => formatCell(v, config.unit)}
        />
        <Caption config={config} />
      </div>
    );
  }

  // table — label → value rows
  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <Caption config={config} />
      <div className={scrollAreaClass}>
        {cells.map((cell, i) => (
          <MetricRow
            key={i}
            label={labels[i] ?? `#${i + 1}`}
            value={formatCell(cell, config.unit)}
          />
        ))}
      </div>
    </div>
  );
}

export const customDataFrame = defineFrame({
  ...customDataMeta,
  component: CustomData,
});
