import { defineFrame, useMetalSpot, useMoney } from "@zframes/core";
import type { z } from "zod";
import { changeColor, formatChangePct } from "./format";
import { METAL_UNIT, metalName } from "./metals-shared";
import { metalsBoardMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = metalsBoardMeta.schema;

/** Live spot board for the metals complex, one row per metal. */
function MetalsBoard({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  // The hook keys off `symbols.join(",")`, so re-reading config.symbols each
  // render is stable — only an actual change of the list re-fires the poll.
  const { metals, isLoading } = useMetalSpot(config.symbols);

  // The provider answers a set, not a sequence, and drops any metal whose quote
  // failed — re-order to the configured display order so the board reads the
  // way it was authored, and keep only the metals that actually answered.
  const bySymbol = new Map(metals.map((metal) => [metal.symbol, metal]));
  const rows = config.symbols
    .map((symbol) => bySymbol.get(symbol))
    .filter((metal): metal is NonNullable<typeof metal> => Boolean(metal));

  if (isLoading)
    return <FrameStatus loading>loading metal quotes…</FrameStatus>;
  // Empty when none of the *configured* metals answered — a partial response
  // still renders, but an all-miss must not leave a bare scroll box behind.
  if (!rows.length) return <FrameStatus>no metal quotes yet</FrameStatus>;

  // Copper has no London fix, so a copper-only board never gets a change to
  // footnote — only explain the column once something in it is populated.
  const hasChange = rows.some((metal) => metal.changePct !== undefined);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={scrollAreaClass}>
        {rows.map((metal) => (
          <div
            key={metal.symbol}
            className="flex items-center justify-between gap-3 border-b border-white/[0.06] py-2 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="body-sm text-strong truncate font-bold">
                {metalName(metal.symbol)}
              </div>
              <div className="caption text-soft">{metal.symbol}</div>
            </div>

            <div className="text-right whitespace-nowrap tabular-nums">
              <div className="body-md text-strong">
                {money.price(metal.price)}
                <span className="caption text-soft ml-1">
                  /{METAL_UNIT[metal.symbol] ?? "oz"}
                </span>
              </div>
              {config.showChange &&
                // The fix history lands a beat after the quote (and copper has
                // no fix at all) — a quiet dash, never a misleading 0.00%.
                (metal.changePct === undefined ? (
                  <div className="caption text-disabled">—</div>
                ) : (
                  <div
                    className="caption font-bold"
                    style={{ color: changeColor(metal.changePct) }}
                  >
                    {formatChangePct(metal.changePct)}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {config.showChange && hasChange && (
        <div className="caption text-soft mt-1.5 shrink-0">
          change vs latest London fix
        </div>
      )}
    </div>
  );
}

export const metalsBoardFrame = defineFrame({
  ...metalsBoardMeta,
  component: MetalsBoard,
});
