import { defineFrame } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ABSENT, DOWN_COLOR, UP_COLOR, formatPct } from "./format";
import {
  CLASS_LABEL,
  THESIS_CLASSES,
  type ThesisClass,
  classRecord,
  useJournal,
} from "./journal-store";
import { StatTile } from "./journal-ui";
import { journalScoreMeta } from "./schemas";
import { scrollAreaClass } from "./ui";

const schema = journalScoreMeta.schema;

type ClassRate = { cls: ThesisClass; n: number; hits: number; rate: number };

/**
 * Best and worst thesis class by hit rate — the edge and the leak — over the
 * classes with graded calls in them.
 *
 * Both readouts used to be read off a hard-coded per-class table, so a
 * first-time user was told where their judgment leaked before they had logged
 * anything. A class with no graded calls has no hit rate. And a leak needs a
 * SECOND class to be worse than: with calls in only one class there is no
 * comparison to report, which is why `leak` is null there rather than the edge
 * class wearing both labels.
 */
function extremes(record: Record<ThesisClass, { n: number; hits: number }>): {
  edge: ClassRate | null;
  leak: ClassRate | null;
} {
  const rows: ClassRate[] = THESIS_CLASSES.filter(
    (cls) => record[cls].n > 0,
  ).map((cls) => ({
    cls,
    n: record[cls].n,
    hits: record[cls].hits,
    rate: record[cls].hits / record[cls].n,
  }));
  if (rows.length === 0) return { edge: null, leak: null };
  rows.sort((a, b) => b.rate - a.rate);
  return {
    edge: rows[0],
    leak: rows.length > 1 ? rows[rows.length - 1] : null,
  };
}

/** The note is a read of the ledger, computed here — not a model's answer, so
 *  it is not labelled as one. */
const NOTE_LABEL = "your record ·";

function JournalScore(_props: { config: z.output<typeof schema> }) {
  const { resolved } = useJournal();
  const record = useMemo(() => classRecord(resolved), [resolved]);
  const { edge, leak } = useMemo(() => extremes(record), [record]);

  // Calibration over the graded calls, all of them the user's own: stated
  // confidence vs realized hit rate. With none there is no reading — it used to
  // compute over the seeded calls and open by telling a first-time user they
  // were overconfident about calls they never made.
  const n = resolved.length;
  const stated = n
    ? Math.round(resolved.reduce((s, c) => s + c.confidence, 0) / n)
    : null;
  const realized = n
    ? Math.round((resolved.filter((c) => c.verdict === "hit").length / n) * 100)
    : null;
  const gap = stated !== null && realized !== null ? stated - realized : null;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="your edge"
          value={edge ? formatPct(edge.rate * 100, 0) : ABSENT}
          sub={
            edge
              ? `${CLASS_LABEL[edge.cls]} · ${edge.hits}/${edge.n}`
              : "no graded calls yet"
          }
          color={edge ? UP_COLOR : undefined}
          absent={!edge}
        />
        <StatTile
          label="your leak"
          value={leak ? formatPct(leak.rate * 100, 0) : ABSENT}
          sub={
            leak
              ? `${CLASS_LABEL[leak.cls]} ${leak.hits}/${leak.n} — size down`
              : edge
                ? "needs a second thesis class"
                : "no graded calls yet"
          }
          color={leak ? DOWN_COLOR : undefined}
          absent={!leak}
        />
        <StatTile
          label="calibration"
          value={gap === null ? ABSENT : `${stated}→${realized}`}
          sub={
            gap === null
              ? "no graded calls yet"
              : gap > 4
                ? `overconfident +${gap}`
                : gap < -4
                  ? `underconfident ${gap}`
                  : "well-calibrated"
          }
          color={
            gap === null ? undefined : Math.abs(gap) > 4 ? "#f4a259" : UP_COLOR
          }
          absent={gap === null}
        />
      </div>
      {/* The read is prose — it can't be made shorter, and on a shorter card it
          was sliced mid-sentence — so the note scrolls and the three tiles
          above it always read whole. `pl-3` only: the scroll primitive brings
          the right padding, which keeps the text off the scrollbar track. */}
      <div
        className={`rounded-md py-2 pl-3 ${scrollAreaClass}`}
        style={{
          background: "hsl(var(--zf-accent-hue, 242) 80% 60% / 0.1)",
          border: "1px solid var(--color-accent-line)",
        }}
      >
        <p className="body-sm text-normal leading-snug">
          <span className="font-semibold text-highlight">{NOTE_LABEL}</span>{" "}
          {edge ? (
            <>
              Sharpest on {CLASS_LABEL[edge.cls]} ({edge.hits}/{edge.n}).
              {leak
                ? ` You leak on ${CLASS_LABEL[leak.cls]} — ${leak.hits}/${
                    leak.n
                  }. Size those down.`
                : " One thesis class graded so far; the comparison needs a second."}
            </>
          ) : (
            <>
              Nothing graded yet. Log a read in Journal · Log — as calls resolve
              at their horizon, this reads where your judgment has an edge and
              where it leaks.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export const journalScoreFrame = defineFrame({
  ...journalScoreMeta,
  component: JournalScore,
});
