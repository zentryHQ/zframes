import { defineFrame } from "@zframes/core";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { dailyAnalysisMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = dailyAnalysisMeta.schema;

interface Call {
  id?: string;
  symbol?: string;
  direction?: "bullish" | "bearish" | "neutral";
  claim: string;
  check?: string;
  horizon?: string;
}

interface Grade {
  callId?: string;
  verdict?: "hit" | "miss" | "partial";
  note?: string;
}

interface RunMeta {
  timestamp?: string;
  model?: string | null;
  effort?: string | null;
  config?: unknown;
}

interface Entry {
  date?: string;
  run?: RunMeta;
  universe?: string[];
  summary?: string;
  calls?: Call[];
  grades?: Grade[];
}

interface Log {
  entries?: Entry[];
}

const DIRECTION_COLOR: Record<string, string> = {
  bullish: "#76d275",
  bearish: "#e6464f",
  neutral: "#9aa0aa",
};

const VERDICT_COLOR: Record<string, string> = {
  hit: "#76d275",
  miss: "#e6464f",
  partial: "#f4a259",
};

/** Running score across every graded call: hit = 1, partial = 0.5, miss = 0. */
function hitRate(entries: Entry[]): { rate: number; n: number } {
  let score = 0;
  let n = 0;
  for (const entry of entries)
    for (const grade of entry.grades ?? []) {
      n++;
      if (grade.verdict === "hit") score += 1;
      else if (grade.verdict === "partial") score += 0.5;
    }
  return { rate: n ? score / n : 0, n };
}

function DailyAnalysis({ config }: { config: z.output<typeof schema> }) {
  const [log, setLog] = useState<Log | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(config.src, { cache: "no-store" })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((json) => {
          if (cancelled) return;
          setLog(json as Log);
          setLoaded(true);
        })
        .catch(() => {
          // A missing/unreadable log is the normal pre-first-run state, not an
          // error to surface — fall through to the empty state below.
          if (cancelled) return;
          setLoaded(true);
        });
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(load, config.refreshSec * 1000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, [config.src, config.refreshSec]);

  if (!loaded) return <FrameStatus loading>loading brief…</FrameStatus>;

  const entries = log?.entries ?? [];
  if (entries.length === 0)
    return <FrameStatus>no brief yet — run /zframes-brief</FrameStatus>;

  const shown = entries.slice(-config.entries).reverse();
  const { rate, n } = hitRate(entries);

  return (
    <div className="body-sm flex h-full flex-col gap-3 overflow-auto">
      {n > 0 && (
        <div className="caption text-soft flex items-center justify-between">
          <span className="uppercase tracking-wide">track record</span>
          <span className="font-bold tabular-nums text-white">
            {Math.round(rate * 100)}% · {n} call{n === 1 ? "" : "s"}
          </span>
        </div>
      )}
      {shown.map((entry, i) => (
        <div key={entry.date ?? i} className="flex flex-col gap-1.5">
          {(entry.date || entry.run?.model) && (
            <div className="caption text-soft flex items-baseline justify-between gap-2">
              <span className="uppercase tracking-wide">{entry.date}</span>
              {entry.run?.model && (
                <span
                  className="truncate opacity-70"
                  title={entry.run.timestamp ?? ""}
                >
                  {entry.run.model}
                  {entry.run.effort ? ` · ${entry.run.effort}` : ""}
                </span>
              )}
            </div>
          )}
          {entry.summary && (
            <div className="text-normal whitespace-pre-wrap">
              {entry.summary}
            </div>
          )}
          {(entry.calls?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-1">
              {entry.calls?.map((call, ci) => (
                <div
                  key={call.id ?? ci}
                  className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-2"
                >
                  <span
                    className="caption font-bold uppercase tracking-wide"
                    style={{
                      color:
                        DIRECTION_COLOR[call.direction ?? "neutral"] ??
                        DIRECTION_COLOR.neutral,
                    }}
                  >
                    {call.symbol ?? call.direction ?? "•"}
                  </span>
                  <span className="text-normal">{call.claim}</span>
                </div>
              ))}
            </div>
          )}
          {(entry.grades?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="caption text-soft uppercase tracking-wide">
                graded
              </span>
              {entry.grades?.map((grade, gi) => (
                <span
                  key={grade.callId ?? gi}
                  className="caption rounded px-1.5 py-0.5 font-bold uppercase"
                  style={{
                    color:
                      VERDICT_COLOR[grade.verdict ?? ""] ??
                      DIRECTION_COLOR.neutral,
                    background: "rgba(255,255,255,0.06)",
                  }}
                  title={grade.note ?? ""}
                >
                  {grade.verdict ?? "—"}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export const dailyAnalysisFrame = defineFrame({
  ...dailyAnalysisMeta,
  component: DailyAnalysis,
});
