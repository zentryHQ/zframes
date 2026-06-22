import { defineFrame, useNews } from "@zframes/core";
import type { NewsItem } from "@zframes/core";
import { useState } from "react";
import type { z } from "zod";
import { timeAgo } from "./format";
import { newsFeedMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

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

// Article thumbnail (CoinDesk/Cointelegraph/Decrypt carry one; other feeds
// don't). Loads directly — feed images aren't CORS-bound — and on any failure
// (404, hotlink block) removes itself so the row reflows to its text-only form.
function Thumbnail({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="size-12 shrink-0 rounded-md bg-white/[0.04] object-cover ring-1 ring-white/10"
    />
  );
}

function HeadlineRow({ item }: { item: NewsItem }) {
  // An accent tick (the ::before bar) slides in on hover to mark the active row.
  // Title caps at two lines for even row heights; the summary gets two lines so a
  // headline carries context.
  // A leading thumbnail shows only when the feed supplied one.
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group relative flex min-w-0 items-start gap-3 border-b border-white/[0.06] py-2 pl-3 no-underline transition-colors last:border-b-0 before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:rounded-full before:bg-highlight before:opacity-0 before:transition-opacity hover:bg-white/[0.03] group-hover:before:opacity-100 hover:before:opacity-100"
    >
      {item.imageUrl && <Thumbnail src={item.imageUrl} />}
      <span className="min-w-0 flex-1">
        <span className="body-sm text-normal line-clamp-2 block font-medium leading-snug transition-colors group-hover:text-white">
          {item.title}
        </span>
        {item.summary && (
          <span className="caption text-soft mt-1 line-clamp-2 block leading-relaxed">
            {item.summary}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 pt-px">
        {item.publishedAt !== undefined && (
          <span className="caption text-soft tabular-nums">
            {timeAgo(item.publishedAt)}
          </span>
        )}
        <span className="caption text-highlight/70 -mr-0.5 w-2 opacity-0 transition-opacity group-hover:opacity-100">
          ↗
        </span>
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
      <div className={scrollAreaClass}>
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
