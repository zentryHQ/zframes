import { defineFrame, useHomeValueIndex, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct } from "./format";
import { MetricRow } from "./metric-row";
import { metroHomeValuesMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = metroHomeValuesMeta.schema;

function MetroHomeValues({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  // Stable array identity across renders; the hook keys its poll on the contents.
  const regions = useMemo(() => [...config.regions], [config.regions]);
  const { index, isLoading } = useHomeValueIndex(regions);

  const rows = useMemo(() => {
    const entries = [...(index?.entries ?? [])];
    entries.sort((a, b) => {
      if (config.sortBy === "size") return a.sizeRank - b.sizeRank;
      if (config.sortBy === "change")
        return (b.changePctYoY ?? -Infinity) - (a.changePctYoY ?? -Infinity);
      return b.value - a.value;
    });
    return entries;
  }, [index, config.sortBy]);

  if (isLoading && rows.length === 0)
    return <FrameStatus loading>loading home values…</FrameStatus>;
  if (rows.length === 0)
    return <FrameStatus>no home-value data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={scrollAreaClass}>
        {rows.map((entry) => (
          <MetricRow
            key={entry.region}
            label={entry.region}
            meta={
              entry.changePctYoY === undefined ? undefined : (
                <span style={{ color: changeColor(entry.changePctYoY) }}>
                  {formatChangePct(entry.changePctYoY)} y/y
                </span>
              )
            }
            // A typical home value IS convertible market money — unlike the
            // US-macro dollar series, a foreign reader converting it is exactly
            // the question they're asking — so it goes through useMoney().
            value={money.price(entry.value)}
          />
        ))}
      </div>
      {index?.asOf ? (
        <div className="caption text-soft shrink-0 pt-1.5 text-center">
          Zillow ZHVI · typical home value · {index.asOf}
        </div>
      ) : null}
    </div>
  );
}

export const metroHomeValuesFrame = defineFrame({
  ...metroHomeValuesMeta,
  component: MetroHomeValues,
});
