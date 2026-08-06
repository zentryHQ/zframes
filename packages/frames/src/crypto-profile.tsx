import { defineFrame, useCryptoProfile, useMoney } from "@zframes/core";
import type { CryptoDeveloperActivity } from "@zframes/core";
import type { ReactNode } from "react";
import type { z } from "zod";
import { AssetLogo } from "./asset-logo";
import { interactiveSurface } from "./content-shared";
import {
  changeColor,
  formatChangePct,
  formatCompact,
  formatPct,
} from "./format";
import { MetricRow } from "./metric-row";
import { cryptoProfileMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = cryptoProfileMeta.schema;

/**
 * A published ISO date, for display. A bare `YYYY-MM-DD` is read as LOCAL
 * midnight — parsed as UTC it renders a day early west of Greenwich, the same
 * trap the event markers document. Publishers send both shapes for ATH/ATL
 * dates (a full timestamp for majors, a bare day for older prints).
 */
function formatIsoDay(iso: string): string {
  const bare = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const date = new Date(bare ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Distance from a record, where the number can be enormous. A long-tail token
 * sits +118,432% above its all-time low and no stat tile holds that many
 * digits; past 1000% the exact figure carries no information anyway, so the
 * magnitude goes through the shared compact formatter and keeps its sign.
 */
function formatWideChangePct(pct: number): string {
  if (Math.abs(pct) < 1000) return formatChangePct(pct);
  return `${pct >= 0 ? "+" : "-"}${formatCompact(Math.abs(pct))}%`;
}

/** A finite, published number — absent fields are the normal case here. */
const has = (value?: number): value is number => Number.isFinite(value);

function Tile({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  color?: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-white/[0.04] px-2 py-1.5">
      <div className="caption text-soft truncate uppercase">{label}</div>
      <div className="metric-sm text-strong truncate" style={{ color }}>
        {value}
      </div>
      {hint && <div className="caption text-soft truncate">{hint}</div>}
    </div>
  );
}

/**
 * The trailing-window returns, as tiles. Only the windows the publisher covers
 * are rendered — a listing weeks old has no 1-year number, and a tile reading
 * "0.00%" would claim it went nowhere.
 */
function ChangeStrip({
  changes,
}: {
  changes: { label: string; pct?: number }[];
}) {
  const present = changes.filter((c) => has(c.pct));
  if (present.length === 0) return null;
  return (
    <div
      className="grid gap-1.5"
      style={{
        gridTemplateColumns: `repeat(${present.length}, minmax(0, 1fr))`,
      }}
    >
      {present.map((c) => (
        <Tile
          key={c.label}
          label={c.label}
          value={formatChangePct(c.pct as number)}
          color={changeColor(c.pct as number)}
        />
      ))}
    </div>
  );
}

/**
 * The repository readout, reduced to the metrics that actually have a value.
 *
 * This is a weak signal on a good day (one public repo, so a monorepo or a
 * rename distorts it) and below the majors the whole block comes back as
 * zeros — a real mid-cap returned 0 issues, 0 closed, 4 commits. Rendering
 * every field would give a wall of "0" the visual weight of a finding, so only
 * positive counts show and a fully-empty block collapses to one quiet line.
 */
function DeveloperActivity({ dev }: { dev: CryptoDeveloperActivity }) {
  const entries: { label: string; value: string }[] = [];
  const push = (label: string, value?: number) => {
    if (has(value) && value > 0)
      entries.push({ label, value: formatCompact(value) });
  };
  push("stars", dev.stars);
  push("forks", dev.forks);
  push("commits 4w", dev.commits4Weeks);
  push("PRs merged", dev.pullRequestsMerged);
  push("contributors", dev.pullRequestContributors);

  // Closed-vs-total only means something when issues exist at all; on its own
  // "0 closed" is indistinguishable from a repo that never files issues.
  const issues =
    has(dev.totalIssues) && dev.totalIssues > 0
      ? `${formatCompact(dev.closedIssues ?? 0)}/${formatCompact(
          dev.totalIssues,
        )} issues closed`
      : null;

  if (entries.length === 0 && !issues)
    return (
      <div className="caption text-disabled">no tracked repo activity</div>
    );

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {entries.map((e) => (
        <span key={e.label} className="caption text-soft">
          <span className="text-normal font-semibold tabular-nums">
            {e.value}
          </span>{" "}
          {e.label}
        </span>
      ))}
      {issues && <span className="caption text-soft">{issues}</span>}
    </div>
  );
}

function LinkPill({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      className={`caption text-normal hover:text-strong px-2 py-1 ${interactiveSurface}`}
    >
      {label}
    </a>
  );
}

function CryptoProfile({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const { profile, isLoading } = useCryptoProfile(config.symbol);

  if (isLoading && !profile)
    return <FrameStatus loading>loading asset profile…</FrameStatus>;
  if (!profile)
    return (
      <FrameStatus>no profile for “{config.symbol.toUpperCase()}”</FrameStatus>
    );

  const ticker = profile.symbol || config.symbol.toUpperCase();
  const links = profile.links ?? {};
  const linkPills = [
    links.homepage && { href: links.homepage, label: "Site" },
    links.sourceCode && { href: links.sourceCode, label: "Code" },
    links.whitepaper && { href: links.whitepaper, label: "Whitepaper" },
  ].filter((l): l is { href: string; label: string } => Boolean(l));

  const categories = profile.categories.slice(0, 6);
  const extraCategories = profile.categories.length - categories.length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <AssetLogo symbol={ticker} size={22} />
          <div className="min-w-0">
            <div className="body-sm text-strong truncate font-semibold">
              {profile.name}
            </div>
            <div className="caption text-soft truncate">
              {ticker}
              {has(profile.marketCapRank) &&
                ` · rank #${profile.marketCapRank}`}
            </div>
          </div>
        </div>
        {has(profile.price) && (
          <div className="shrink-0 text-right">
            <div className="metric-md text-strong leading-none">
              {money.price(profile.price)}
            </div>
            {has(profile.changePct24h) && (
              <div
                className="caption font-bold tabular-nums"
                style={{ color: changeColor(profile.changePct24h) }}
              >
                {formatChangePct(profile.changePct24h)} 24h
              </div>
            )}
          </div>
        )}
      </div>

      <ChangeStrip
        changes={[
          { label: "24h", pct: profile.changePct24h },
          { label: "7d", pct: profile.changePct7d },
          { label: "30d", pct: profile.changePct30d },
          { label: "1y", pct: profile.changePct1y },
        ]}
      />

      <div className={`flex flex-col gap-2 ${scrollAreaClass}`}>
        <div className="grid grid-cols-3 gap-1.5">
          <Tile
            label="Market cap"
            value={
              has(profile.marketCap) ? money.compact(profile.marketCap) : "—"
            }
          />
          <Tile
            label="FDV"
            value={
              has(profile.fullyDilutedValuation)
                ? money.compact(profile.fullyDilutedValuation)
                : "—"
            }
            hint={
              has(profile.fullyDilutedValuation) ? undefined : "unpublished"
            }
          />
          <Tile
            label="Volume 24h"
            value={
              has(profile.volume24h) ? money.compact(profile.volume24h) : "—"
            }
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <Tile
            label="Circulating"
            value={
              has(profile.circulatingSupply)
                ? formatCompact(profile.circulatingSupply)
                : "—"
            }
            hint={ticker}
          />
          <Tile
            label="Total"
            value={
              has(profile.totalSupply)
                ? formatCompact(profile.totalSupply)
                : "—"
            }
            hint={
              has(profile.totalSupply) && has(profile.circulatingSupply)
                ? `${formatPct(
                    (profile.circulatingSupply / profile.totalSupply) * 100,
                    1,
                  )} circulating`
                : undefined
            }
          />
          {/* An absent max supply means NO CAP, not zero — the one reading this
              card must never invert. An uncapped asset says so in words. */}
          <Tile
            label="Max"
            value={
              has(profile.maxSupply) ? formatCompact(profile.maxSupply) : "∞"
            }
            hint={has(profile.maxSupply) ? "hard cap" : "uncapped"}
          />
        </div>

        <div className="min-w-0">
          {has(profile.ath) && (
            <MetricRow
              label="All-time high"
              meta={profile.athDate ? formatIsoDay(profile.athDate) : undefined}
              value={
                <span className="flex items-baseline gap-2">
                  <span>{money.price(profile.ath)}</span>
                  {has(profile.athChangePct) && (
                    <span
                      className="caption font-bold"
                      style={{ color: changeColor(profile.athChangePct) }}
                    >
                      {formatWideChangePct(profile.athChangePct)}
                    </span>
                  )}
                </span>
              }
            />
          )}
          {has(profile.atl) && (
            <MetricRow
              label="All-time low"
              meta={profile.atlDate ? formatIsoDay(profile.atlDate) : undefined}
              value={
                <span className="flex items-baseline gap-2">
                  <span>{money.price(profile.atl)}</span>
                  {has(profile.atlChangePct) && (
                    <span
                      className="caption font-bold"
                      style={{ color: changeColor(profile.atlChangePct) }}
                    >
                      {formatWideChangePct(profile.atlChangePct)}
                    </span>
                  )}
                </span>
              }
            />
          )}
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {categories.map((category) => (
              <span
                key={category}
                className="caption text-soft rounded-full bg-white/[0.06] px-2 py-0.5"
              >
                {category}
              </span>
            ))}
            {extraCategories > 0 && (
              <span className="caption text-disabled px-1 py-0.5">
                +{extraCategories}
              </span>
            )}
          </div>
        )}

        {config.showDeveloper && (
          <div className="flex flex-col gap-1">
            <div className="caption text-soft uppercase">development</div>
            <DeveloperActivity dev={profile.developer ?? {}} />
          </div>
        )}

        {config.showLinks && linkPills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {linkPills.map((link) => (
              <LinkPill key={link.href} {...link} />
            ))}
          </div>
        )}

        {/* Off by default: a published description runs to ~2,000 characters,
            and unclamped it turns the research card into a wall of prose. */}
        {config.showDescription && profile.description && (
          <p className="caption text-soft line-clamp-3 leading-relaxed">
            {profile.description}
          </p>
        )}
      </div>
    </div>
  );
}

export const cryptoProfileFrame = defineFrame({
  ...cryptoProfileMeta,
  component: CryptoProfile,
});
