import { MiniLineChart } from "@zframes/charts";
import { defineFrame } from "@zframes/core";
import { useMemo, useState } from "react";
import type { z } from "zod";
import { interactiveSurface } from "./content-shared";
import { changeColor, formatChangePct, formatCompactUsd } from "./format";
import { returnsProjectorMeta } from "./schemas";

const schema = returnsProjectorMeta.schema;
type Config = z.output<typeof schema>;

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className={`flex flex-col gap-0.5 px-2 py-1 ${interactiveSurface}`}>
      <span className="caption text-soft truncate">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="body-sm text-strong w-full bg-transparent outline-none"
      />
    </label>
  );
}

function ReturnsProjector({ config }: { config: Config }) {
  const [principal, setPrincipal] = useState(config.principal);
  const [ratePct, setRatePct] = useState(config.ratePct);
  const [periods, setPeriods] = useState(config.periods);
  const [contribution, setContribution] = useState(config.contribution);

  const { series, ending, contributed, gain } = useMemo(() => {
    const r = ratePct / 100;
    const n = Math.max(0, Math.min(600, Math.floor(periods)));
    const pts: { date: string; value: number }[] = [
      { date: "0", value: principal },
    ];
    let bal = principal;
    let contrib = principal;
    for (let i = 1; i <= n; i++) {
      bal = bal * (1 + r) + contribution;
      contrib += contribution;
      pts.push({ date: String(i), value: bal });
    }
    return { series: pts, ending: bal, contributed: contrib, gain: bal - contrib };
  }, [principal, ratePct, periods, contribution]);

  const gainPct = contributed > 0 ? (gain / contributed) * 100 : 0;
  const label = config.label.trim();

  return (
    <div className="flex h-full w-full flex-col gap-2">
      {label && (
        <div className="caption text-soft shrink-0 uppercase tracking-[0.12em]">
          {label}
        </div>
      )}
      <div className="shrink-0">
        <div className="caption text-soft">projected value</div>
        <div className="metric-lg text-strong">{formatCompactUsd(ending)}</div>
        <div className="body-sm" style={{ color: changeColor(gainPct) }}>
          {formatChangePct(gainPct)} · {formatCompactUsd(gain)} gain
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <MiniLineChart
          data={series}
          width={260}
          height={48}
          variant="green"
          className="w-full"
        />
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-1.5">
        <Field label="principal" value={principal} onChange={setPrincipal} />
        <Field label="rate %/period" value={ratePct} onChange={setRatePct} />
        <Field label="periods" value={periods} onChange={setPeriods} />
        <Field
          label="contribution"
          value={contribution}
          onChange={setContribution}
        />
      </div>
    </div>
  );
}

export const returnsProjectorFrame = defineFrame({
  ...returnsProjectorMeta,
  component: ReturnsProjector,
});
