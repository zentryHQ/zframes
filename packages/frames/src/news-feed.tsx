import { defineFrame, useNews } from "@zframes/core";
import type { NewsItem } from "@zframes/core";
import type { z } from "zod";
import { timeAgo } from "./format";
import { newsFeedMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = newsFeedMeta.schema;

// Header label per source, used before the first item loads (once items arrive,
// the row's own `source` is authoritative). Keep keys in sync with the schema
// enum and the provider's FEEDS map.
const SOURCE_LABELS: Record<string, string> = {
  coindesk: "CoinDesk",
  cointelegraph: "Cointelegraph",
  decrypt: "Decrypt",
  cnbc: "CNBC Markets",
  nasdaq: "Nasdaq",
  stocks: "Google News",
};

function HeadlineRow({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group flex min-w-0 items-start gap-3 border-b border-white/[0.06] py-1.5 no-underline transition-colors last:border-b-0 hover:bg-white/[0.03]"
    >
      <span className="min-w-0 flex-1">
        <span className="body-sm text-normal block font-medium leading-snug">
          {item.title}
        </span>
        {item.summary && (
          <span className="caption text-soft mt-0.5 block truncate">
            {item.summary}
          </span>
        )}
      </span>
      {item.publishedAt !== undefined && (
        <span className="caption text-soft shrink-0 tabular-nums">
          {timeAgo(item.publishedAt)}
        </span>
      )}
      <span className="caption text-soft shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
        ↗
      </span>
    </a>
  );
}

function NewsFeed({ config }: { config: z.output<typeof schema> }) {
  // The per-symbol "stocks" feed needs symbols; with none chosen, disable the
  // fetch (empty feed) and show guidance rather than an error.
  const isStocks = config.source === "stocks";
  const needsSymbols = isStocks && config.symbols.length === 0;
  const feed = needsSymbols ? "" : config.source;
  const { items, isLoading } = useNews(
    feed,
    isStocks ? config.symbols : undefined,
    config.count,
  );

  if (needsSymbols) {
    return <FrameStatus>add stock symbols to show company headlines</FrameStatus>;
  }
  if (isLoading) return <FrameStatus loading>loading headlines…</FrameStatus>;

  const label = items[0]?.source ?? SOURCE_LABELS[config.source] ?? "news";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="caption text-soft truncate">{label}</span>
        <span className="caption text-soft shrink-0">headlines</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length > 0 ? (
          items.map((item) => <HeadlineRow key={item.url} item={item} />)
        ) : (
          <div className="body-sm text-soft flex h-full items-center justify-center text-center">
            no headlines {isStocks ? "for these symbols" : "available"} — the
            runtime proxy may be offline
          </div>
        )}
      </div>
    </div>
  );
}

export const newsFeedFrame = defineFrame({
  ...newsFeedMeta,
  component: NewsFeed,
});
