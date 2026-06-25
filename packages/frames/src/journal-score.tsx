import { defineFrame } from "@zframes/core";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR } from "./format";
import {
  CLASS_LABEL,
  CLASS_RECORD,
  type ThesisClass,
  useJournal,
} from "./journal-store";
import { StatTile } from "./journal-ui";
import { journalScoreMeta } from "./schemas";

const schema = journalScoreMeta.schema;

// Best / worst thesis class by hit rate — your edge and your leak.
function extremes() {
  const rows = (Object.keys(CLASS_RECORD) as ThesisClass[]).map((cls) => ({
    cls,
    rate: CLASS_RECORD[cls].hits / CLASS_RECORD[cls].n,
  }));
  rows.sort((a, b) => b.rate - a.rate);
  return { edge: rows[0], leak: rows[rows.length - 1] };
}

function JournalScore(_props: { config: z.output<typeof schema> }) {
  const { resolved } = useJournal();
  const { edge, leak } = extremes();

  // Calibration from the graded calls: stated confidence vs realized hit rate.
  const n = resolved.length;
  const stated = n
    ? Math.round(resolved.reduce((s, c) => s + c.confidence, 0) / n)
    : 0;
  const realized = n
    ? Math.round(
        (resolved.filter((c) => c.verdict === "hit").length / n) * 100,
      )
    : 0;
  const gap = stated - realized;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="your edge"
          value={`${Math.round(edge.rate * 100)}%`}
          sub={CLASS_LABEL[edge.cls]}
          color={UP_COLOR}
        />
        <StatTile
          label="your leak"
          value={`${Math.round(leak.rate * 100)}%`}
          sub={`${CLASS_LABEL[leak.cls]} — size down`}
          color={DOWN_COLOR}
        />
        <StatTile
          label="calibration"
          value={n ? `${stated}→${realized}` : "—"}
          sub={
            n
              ? gap > 4
                ? `overconfident +${gap}`
                : gap < -4
                  ? `underconfident ${gap}`
                  : "well-calibrated"
              : "no calls yet"
          }
          color={Math.abs(gap) > 4 ? "#f4a259" : UP_COLOR}
        />
      </div>
      <div
        className="rounded-md px-3 py-2"
        style={{
          background: "hsl(var(--zf-accent-hue, 242) 80% 60% / 0.1)",
          border: "1px solid var(--color-accent-line)",
        }}
      >
        <p className="body-sm text-normal leading-snug">
          <span className="font-semibold text-highlight">zAI ·</span> Sharpest on{" "}
          {CLASS_LABEL[edge.cls]}. You leak on {CLASS_LABEL[leak.cls]} —{" "}
          {CLASS_RECORD[leak.cls].hits}/{CLASS_RECORD[leak.cls].n}, and your kill
          rule tripped on most of them. Size those down.
        </p>
      </div>
    </div>
  );
}

export const journalScoreFrame = defineFrame({
  ...journalScoreMeta,
  component: JournalScore,
});
