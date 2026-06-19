import {
  defineFrame,
  useReferenceRates,
  useTreasuryAverageRates,
} from "@zframes/core";
import type { z } from "zod";
import { ratesBoardMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = ratesBoardMeta.schema;

function formatRate(value: number): string {
  return `${value.toFixed(2)}%`;
}

function RateRow({
  label,
  value,
  meta,
}: {
  label: string;
  value: number;
  meta: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-white/[0.06] py-1.5 last:border-b-0">
      <div className="min-w-0">
        <div className="body-sm text-normal truncate font-semibold">
          {label}
        </div>
        <div className="caption text-soft truncate">{meta}</div>
      </div>
      <div className="font-dmsans text-strong text-lg font-bold tabular-nums">
        {formatRate(value)}
      </div>
    </div>
  );
}

function RatesBoard({ config }: { config: z.output<typeof schema> }) {
  const { rates: referenceRates, isLoading: referenceLoading } =
    useReferenceRates();
  const { rates: treasuryRates, isLoading: treasuryLoading } =
    useTreasuryAverageRates();

  if (referenceLoading && treasuryLoading) {
    return <FrameStatus loading>loading official rates…</FrameStatus>;
  }
  if (!referenceRates.length && !treasuryRates.length) {
    return <FrameStatus>no rates data</FrameStatus>;
  }

  const shownReferenceRates = referenceRates.slice(0, config.maxReferenceRates);
  const shownTreasuryRates = treasuryRates.slice(0, config.maxTreasuryRates);
  const referenceDate = shownReferenceRates[0]?.date;
  const treasuryDate = shownTreasuryRates[0]?.date;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">official rates</div>
          <div className="body-sm text-normal">
            {referenceDate ? `as of ${referenceDate}` : "reference rates"}
          </div>
        </div>
        <div className="caption text-soft text-right">daily</div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {shownReferenceRates.map((rate) => {
          const target =
            rate.targetRateFrom !== undefined && rate.targetRateTo !== undefined
              ? `target ${formatRate(rate.targetRateFrom)}-${formatRate(rate.targetRateTo)}`
              : rate.volumeInBillions !== undefined
                ? `$${rate.volumeInBillions.toFixed(0)}B volume`
                : rate.source;
          return (
            <RateRow
              key={rate.code}
              label={rate.label}
              value={rate.rate}
              meta={target}
            />
          );
        })}
      </div>

      {config.showTreasuryAverageRates && shownTreasuryRates.length > 0 && (
        <div className="border-t border-white/[0.08] pt-2">
          <div className="caption text-soft mb-1 flex justify-between">
            <span>Treasury average rates</span>
            <span>{treasuryDate}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {shownTreasuryRates.map((rate) => (
              <div
                key={`${rate.date}-${rate.security}`}
                className="rounded bg-white/[0.04] px-2 py-1.5"
              >
                <div className="caption text-soft truncate">
                  {rate.security}
                </div>
                <div className="body-sm text-strong font-bold tabular-nums">
                  {formatRate(rate.rate)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const ratesBoardFrame = defineFrame({
  ...ratesBoardMeta,
  component: RatesBoard,
});
