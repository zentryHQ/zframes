import { defineFrame, useSocial } from "@zframes/core";
import type { NewsItem } from "@zframes/core";
import type { z } from "zod";
import { timeAgo } from "./format";
import { hackerNewsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = hackerNewsMeta.schema;

function StoryRow({ item }: { item: NewsItem }) {
  // Two links: the headline opens the article, the meta line opens the HN
  // discussion. Separate anchors so each target is one click away.
  const meta: string[] = [];
  if (item.points !== undefined) meta.push(`${item.points} pts`);
  if (item.commentCount !== undefined) meta.push(`${item.commentCount} comments`);
  if (item.publishedAt !== undefined) meta.push(timeAgo(item.publishedAt));

  return (
    <div className="group flex min-w-0 flex-col gap-0.5 border-b border-white/[0.06] py-1.5 last:border-b-0">
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer noopener"
        className="body-sm text-normal block font-medium leading-snug no-underline transition-colors hover:text-white"
      >
        {item.title}
      </a>
      <a
        href={item.commentsUrl ?? item.url}
        target="_blank"
        rel="noreferrer noopener"
        className="caption text-soft no-underline transition-colors hover:text-white"
      >
        {meta.join(" · ") || "discuss"}
      </a>
    </div>
  );
}

function HackerNews({ config }: { config: z.output<typeof schema> }) {
  const { items, isLoading } = useSocial(config.query, config.count);

  if (isLoading) return <FrameStatus loading>loading Hacker News…</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="caption text-soft truncate">
          {config.query ? `“${config.query}”` : "front page"}
        </span>
        <span className="caption text-soft shrink-0">stories</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length > 0 ? (
          items.map((item) => <StoryRow key={item.commentsUrl ?? item.url} item={item} />)
        ) : (
          <div className="body-sm text-soft flex h-full items-center justify-center text-center">
            no stories{config.query ? ` for “${config.query}”` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

export const hackerNewsFrame = defineFrame({
  ...hackerNewsMeta,
  component: HackerNews,
});
