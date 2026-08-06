import { BarChart } from "@zframes/charts";
import type { BarDatum } from "@zframes/charts";
import { defineFrame, useCryptoProfile, useMoney } from "@zframes/core";
import type { CryptoAssetProfile } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompact, formatPct } from "./format";
import { cryptoDilutionMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = cryptoDilutionMeta.schema;

/** Circulating supply — the part the market has already priced. */
const CIRCULATING = "hsl(var(--zf-accent-hue, 242) 85% 72%)";
/** Minted but not circulating: team/investor locks, vesting, treasury. */
const LOCKED = "hsl(var(--zf-accent-hue, 242) 45% 55%)";
/** Room left under a hard cap — not issued at all yet. */
const HEADROOM = "rgba(255,255,255,0.16)";

const has = (value?: number): value is number => Number.isFinite(value);

/**
 * Which supply figure dilution is measured against, and what that figure is
 * allowed to claim. These three are genuinely different investments and the
 * frame must never collapse them:
 *
 * - `capped`   — a hard cap is published, so the denominator is a real ceiling
 *                and "fully diluted" has an end state.
 * - `issued`   — total supply is known but nothing caps it. The gap to total is
 *                real, but FDV is a FLOOR: more can always be minted.
 * - `unknown`  — neither is published. Nothing can be measured; the card says
 *                so rather than defaulting a denominator and inventing a number.
 */
type DilutionState = "capped" | "issued" | "unknown";

interface Dilution {
  state: DilutionState;
  /** The supply the valuation is measured against (max or total). */
  denominator?: number;
  circulating?: number;
  segments: BarDatum[];
  marketCap?: number;
  marketCapDerived: boolean;
  fdv?: number;
  fdvDerived: boolean;
}

function analyse(
  profile: CryptoAssetProfile,
  basis: z.output<typeof schema>["basis"],
): Dilution {
  const circulating = has(profile.circulatingSupply)
    ? profile.circulatingSupply
    : undefined;
  const total = has(profile.totalSupply) ? profile.totalSupply : undefined;
  // Absent max supply means UNCAPPED, not zero. Treated as zero it would read
  // as "already fully diluted" — the exact inversion of the truth.
  const max = has(profile.maxSupply) ? profile.maxSupply : undefined;

  // `basis` picks which figure to measure against; each side still falls back
  // to the other, so pinning "total" on an asset that publishes only a cap
  // measures against the cap — and is then *described* as a cap below, rather
  // than mislabelled as issued supply.
  const denominator = basis === "total" ? (total ?? max) : (max ?? total);
  const state: DilutionState =
    denominator === undefined || denominator <= 0
      ? "unknown"
      : denominator === max
        ? "capped"
        : "issued";

  const marketCap = has(profile.marketCap)
    ? profile.marketCap
    : has(profile.price) && circulating !== undefined
      ? profile.price * circulating
      : undefined;
  const marketCapDerived = !has(profile.marketCap) && marketCap !== undefined;

  // The publisher omits FDV for plenty of mid-caps even when it ships the
  // supply and the price it would multiply — so derive it, and say it's derived.
  const fdv = has(profile.fullyDilutedValuation)
    ? profile.fullyDilutedValuation
    : has(profile.price) && denominator !== undefined
      ? profile.price * denominator
      : undefined;
  const fdvDerived = !has(profile.fullyDilutedValuation) && fdv !== undefined;

  const segments: BarDatum[] = [];
  if (state !== "unknown" && circulating !== undefined) {
    segments.push({
      label: "Circulating",
      value: circulating,
      color: CIRCULATING,
    });
    // Publishers round supply figures independently, so circulating can edge
    // past total by a rounding error; clamp rather than draw a negative bar.
    const issuedCeiling = total ?? denominator;
    const locked = Math.max(0, (issuedCeiling as number) - circulating);
    if (locked > 0)
      segments.push({
        label: state === "capped" && total ? "Locked" : "Not circulating",
        value: locked,
        color: LOCKED,
      });
    if (state === "capped" && total !== undefined) {
      const headroom = Math.max(0, (denominator as number) - total);
      if (headroom > 0)
        segments.push({
          label: "Unminted",
          value: headroom,
          color: HEADROOM,
        });
    }
  }

  return {
    state,
    denominator,
    circulating,
    segments,
    marketCap,
    marketCapDerived,
    fdv,
    fdvDerived,
  };
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-white/[0.04] px-2 py-1.5">
      <div className="caption text-soft truncate uppercase">{label}</div>
      <div className="metric-sm text-strong truncate">{value}</div>
      {hint && <div className="caption text-soft truncate">{hint}</div>}
    </div>
  );
}

function CryptoDilution({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const { profile, isLoading } = useCryptoProfile(config.symbol);

  const dilution = useMemo(
    () => (profile ? analyse(profile, config.basis) : null),
    [profile, config.basis],
  );

  if (isLoading && !profile)
    return <FrameStatus loading>loading supply…</FrameStatus>;
  if (!profile || !dilution)
    return (
      <FrameStatus>no profile for “{config.symbol.toUpperCase()}”</FrameStatus>
    );

  const ticker = profile.symbol || config.symbol.toUpperCase();
  const { state, denominator, circulating, marketCap, fdv } = dilution;

  // Nothing to measure and nothing to fall back on: no supply denominator AND
  // no published FDV. Saying so is the honest render — a denominator guessed
  // from circulating supply would report 100% circulating for an asset whose
  // unlock schedule is simply unpublished.
  if (state === "unknown" && fdv === undefined)
    return (
      <FrameStatus>
        no supply figures published for “{ticker}” — dilution can’t be measured
      </FrameStatus>
    );

  const circulatingPct =
    circulating !== undefined && denominator
      ? (circulating / denominator) * 100
      : null;
  const gap =
    marketCap !== undefined && fdv !== undefined
      ? Math.max(0, fdv - marketCap)
      : null;
  const gapPct = gap !== null && fdv ? (gap / fdv) * 100 : null;
  const ratio =
    marketCap !== undefined && fdv !== undefined && marketCap > 0
      ? fdv / marketCap
      : null;

  const basisLabel =
    state === "capped"
      ? "of the hard cap"
      : state === "issued"
        ? "of issued supply"
        : "";

  const footnote =
    state === "capped"
      ? `hard cap ${formatCompact(
          denominator as number,
        )} ${ticker} — FDV is a real ceiling`
      : state === "issued"
        ? `no hard cap — ${formatCompact(
            denominator as number,
          )} ${ticker} issued so far, so FDV is a floor, not a ceiling`
        : "supply unpublished — showing the publisher's own FDV only";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="body-sm text-strong truncate font-semibold">
            {profile.name}
          </div>
          <div className="caption text-soft truncate">{ticker} supply</div>
        </div>
        {circulatingPct !== null && (
          <div className="shrink-0 text-right">
            <div className="metric-md text-strong leading-none">
              {formatPct(circulatingPct, 1)}
            </div>
            <div className="caption text-soft">circulating {basisLabel}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Tile
          label="Market cap"
          value={marketCap !== undefined ? money.compact(marketCap) : "—"}
          hint={dilution.marketCapDerived ? "derived" : undefined}
        />
        <Tile
          label="FDV"
          value={fdv !== undefined ? money.compact(fdv) : "—"}
          hint={dilution.fdvDerived ? "derived" : undefined}
        />
        <Tile
          label="Not circulating"
          value={gap !== null ? money.compact(gap) : "—"}
          hint={
            gapPct !== null
              ? `${formatPct(gapPct, 1)} of FDV${
                  ratio !== null ? ` · ${ratio.toFixed(2)}×` : ""
                }`
              : undefined
          }
        />
      </div>

      {config.showChart && dilution.segments.length > 1 && (
        <div className="min-h-0 flex-1">
          <BarChart
            data={dilution.segments}
            orientation="horizontal"
            height={Math.max(dilution.segments.length * 26, 78)}
            formatValue={formatCompact}
          />
        </div>
      )}

      <div className="caption text-soft truncate" title={footnote}>
        {footnote}
      </div>
    </div>
  );
}

export const cryptoDilutionFrame = defineFrame({
  ...cryptoDilutionMeta,
  component: CryptoDilution,
});
