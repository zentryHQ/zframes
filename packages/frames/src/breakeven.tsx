import { defineFrame } from "@zframes/core";
import { useMemo, useState } from "react";
import type { z } from "zod";
import { interactiveSurface } from "./content-shared";
import { changeColor, formatChangePct, formatPrice } from "./format";
import { breakevenMeta } from "./schemas";
import { scrollAreaClass } from "./ui";

const schema = breakevenMeta.schema;
type Config = z.output<typeof schema>;
type Fill = { price: number; size: number };

function Breakeven({ config }: { config: Config }) {
  const [fills, setFills] = useState<Fill[]>(
    config.fills.length ? config.fills : [{ price: 0, size: 0 }],
  );
  const [current, setCurrent] = useState(config.currentPrice);

  const { avg, totalSize } = useMemo(() => {
    let cost = 0;
    let size = 0;
    for (const f of fills) {
      cost += f.price * f.size;
      size += f.size;
    }
    return { avg: size > 0 ? cost / size : 0, totalSize: size };
  }, [fills]);

  const pnlPct = avg > 0 && current > 0 ? ((current - avg) / avg) * 100 : null;
  const label = config.label.trim();

  const update = (i: number, key: keyof Fill, v: number) =>
    setFills((fs) => fs.map((f, j) => (j === i ? { ...f, [key]: v } : f)));

  return (
    <div className="flex h-full w-full flex-col gap-2">
      {label && (
        <div className="caption text-soft shrink-0 uppercase tracking-[0.12em]">
          {label}
        </div>
      )}
      <div className="shrink-0">
        <div className="caption text-soft">break-even (avg cost)</div>
        <div className="metric-lg text-strong">
          {totalSize > 0 ? formatPrice(avg) : "—"}
        </div>
        <div className="caption text-soft">
          {totalSize > 0 ? `${totalSize} units` : "add fills below"}
          {pnlPct !== null && (
            <>
              {" · "}
              <span style={{ color: changeColor(pnlPct) }}>
                {formatChangePct(pnlPct)} unrealized
              </span>
            </>
          )}
        </div>
      </div>
      <div className={`min-h-0 flex-1 ${scrollAreaClass}`}>
        {fills.map((f, i) => (
          <div key={i} className="mb-1 flex items-center gap-1">
            <label
              className={`flex flex-1 items-center gap-1 px-2 py-1 ${interactiveSurface}`}
            >
              <span className="caption text-soft">px</span>
              <input
                type="number"
                value={Number.isFinite(f.price) ? f.price : 0}
                onChange={(e) => update(i, "price", Number(e.target.value))}
                className="body-sm text-strong w-full bg-transparent outline-none"
              />
            </label>
            <label
              className={`flex flex-1 items-center gap-1 px-2 py-1 ${interactiveSurface}`}
            >
              <span className="caption text-soft">sz</span>
              <input
                type="number"
                value={Number.isFinite(f.size) ? f.size : 0}
                onChange={(e) => update(i, "size", Number(e.target.value))}
                className="body-sm text-strong w-full bg-transparent outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() =>
                setFills((fs) => (fs.length > 1 ? fs.filter((_, j) => j !== i) : fs))
              }
              className="caption text-soft hover:text-strong shrink-0 px-1"
              aria-label="remove fill"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setFills((fs) => [...fs, { price: 0, size: 0 }])}
          className={`caption text-soft hover:text-strong w-full px-2 py-1 ${interactiveSurface}`}
        >
          + add fill
        </button>
      </div>
      <label
        className={`flex shrink-0 items-center gap-1 px-2 py-1 ${interactiveSurface}`}
      >
        <span className="caption text-soft shrink-0">current price</span>
        <input
          type="number"
          value={Number.isFinite(current) ? current : 0}
          onChange={(e) => setCurrent(Number(e.target.value))}
          className="body-sm text-strong w-full bg-transparent text-right outline-none"
        />
      </label>
    </div>
  );
}

export const breakevenFrame = defineFrame({
  ...breakevenMeta,
  component: Breakeven,
});
