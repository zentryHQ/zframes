import { defineFrame, useCompanyFilings } from "@zframes/core";
import type { SecFiling } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { AssetLogo, tickerOf } from "./asset-logo";
import { FeedRow } from "./feed-row";
import { timeAgo } from "./format";
import { filingsFeedMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = filingsFeedMeta.schema;

// Human labels for the forms users actually recognise; anything else falls back
// to EDGAR's own description or the bare form code.
const FORM_LABELS: Record<string, string> = {
  "10-K": "Annual report",
  "10-Q": "Quarterly report",
  "8-K": "Material event",
  "20-F": "Annual report (foreign)",
  "40-F": "Annual report (foreign)",
  "6-K": "Foreign interim report",
  "S-1": "Registration",
  "S-3": "Registration",
  "S-4": "Registration (M&A)",
  "DEF 14A": "Proxy statement",
  DEFA14A: "Proxy materials",
  "SC 13D": "Activist stake",
  "SC 13G": "Passive stake",
  SD: "Specialized disclosure",
  "3": "Initial insider ownership",
  "4": "Insider transaction",
  "5": "Annual insider ownership",
  "144": "Proposed insider sale",
  "11-K": "Employee benefit plan",
};

// Periodic / material reports — the signal most dashboards want, minus the
// constant drip of insider Form 4s.
const IMPORTANT_RE =
  /^(10-K|10-Q|8-K|20-F|40-F|6-K|S-|F-|424|DEF |DEFA|DEFM|11-K|SC 13|25)/i;
const INSIDER_RE = /^(3|4|5|144)(\/A)?$/;

// EDGAR returns verbose codes ("SCHEDULE 13G/A"); shorten for the badge + filter.
function shortForm(form: string): string {
  return form.replace(/^SCHEDULE /i, "SC ").trim();
}

function matchesFilter(form: string, mode: "important" | "all" | "insider") {
  if (mode === "all") return true;
  if (mode === "insider") return INSIDER_RE.test(form);
  return IMPORTANT_RE.test(form);
}

function formLabel(filing: SecFiling): string {
  const form = shortForm(filing.form);
  if (FORM_LABELS[form]) return FORM_LABELS[form];
  const base = form.replace(/\/A$/, "");
  if (base !== form && FORM_LABELS[base])
    return `${FORM_LABELS[base]} (amended)`;
  return filing.description &&
    filing.description.toUpperCase() !== filing.form.toUpperCase()
    ? filing.description
    : form;
}

function FilingRow({ filing }: { filing: SecFiling }) {
  return (
    <FeedRow
      href={filing.url}
      titleAttr={filing.form}
      leading={
        <span className="caption text-strong inline-flex w-16 shrink-0 justify-center truncate rounded bg-white/[0.06] px-1.5 py-1 font-bold">
          {shortForm(filing.form)}
        </span>
      }
      title={formLabel(filing)}
      subtitle={
        filing.reportDate
          ? `period ${filing.reportDate}`
          : filing.items
            ? `items ${filing.items}`
            : filing.accessionNumber
      }
      meta={
        filing.filingDate
          ? timeAgo(new Date(filing.filingDate).getTime())
          : undefined
      }
    />
  );
}

function FilingsFeed({ config }: { config: z.output<typeof schema> }) {
  const { data, isLoading } = useCompanyFilings(config.symbol);

  const shown = useMemo(
    () =>
      (data?.filings ?? [])
        .filter((f) => matchesFilter(shortForm(f.form), config.forms))
        .slice(0, config.count),
    [data?.filings, config.forms, config.count],
  );

  if (isLoading) return <FrameStatus loading>loading SEC filings…</FrameStatus>;
  if (!data)
    return (
      <FrameStatus>no SEC data for “{tickerOf(config.symbol)}”</FrameStatus>
    );

  const ticker = data.tickers[0];
  const logoSymbol = config.symbol.includes(":")
    ? config.symbol
    : ticker
      ? `xyz:${ticker}`
      : null;
  const subtitle = [data.exchanges[0], data.category]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {logoSymbol && <AssetLogo symbol={logoSymbol} size={22} />}
          <div className="min-w-0">
            <div className="body-sm text-strong truncate font-semibold">
              {data.name || ticker || tickerOf(config.symbol)}
            </div>
            {subtitle && (
              <div className="caption text-soft truncate">{subtitle}</div>
            )}
          </div>
        </div>
        <div className="caption text-soft shrink-0 text-right">filings</div>
      </div>

      <div className={scrollAreaClass}>
        {shown.length > 0 ? (
          shown.map((filing) => (
            <FilingRow key={filing.accessionNumber} filing={filing} />
          ))
        ) : (
          <FrameStatus>
            no {config.forms === "all" ? "" : `${config.forms} `}filings yet
          </FrameStatus>
        )}
      </div>
    </div>
  );
}

export const filingsFeedFrame = defineFrame({
  ...filingsFeedMeta,
  component: FilingsFeed,
});
