import { defineFrame, useMoney, useTokenizedGold } from "@zframes/core";
import type { TokenizedGold as GoldToken } from "@zframes/core";
import type { z } from "zod";
import { AssetLogo } from "./asset-logo";
import { changeColor, formatChangePct, formatCompact } from "./format";
import { tokenizedGoldMeta } from "./schemas";
import { Stat } from "./stat";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = tokenizedGoldMeta.schema;

function TokenTile({
  token,
  showPremium,
}: {
  token: GoldToken;
  showPremium: boolean;
}) {
  const money = useMoney();
  return (
    <div className="flex min-h-0 min-w-0 flex-col rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2">
      {/* The tile scrolls rather than clips: identity, price and the three stats
          are all the tile's substance, and the old centred stack overflowed at
          BOTH ends on a short card — losing the symbol as well as the stats.
          `my-auto` keeps the centring while it fits (a scroll container's
          `justify-center` would put the overflow past its scrollable start). */}
      <div className={`${scrollAreaClass} flex flex-col`}>
        <div className="my-auto flex flex-col gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <AssetLogo symbol={token.symbol} size={18} />
            <div className="min-w-0">
              <div className="body-sm text-strong truncate font-bold">
                {token.symbol}
              </div>
              <div className="caption text-soft truncate">{token.name}</div>
            </div>
          </div>

          <div>
            <div className="metric-md text-strong leading-none">
              {money.price(token.price)}
            </div>
            <div
              className="caption mt-1 font-bold"
              style={{ color: changeColor(token.changePct) }}
            >
              {formatChangePct(token.changePct)}
              <span className="text-soft ml-1 font-medium">24h</span>
            </div>
          </div>

          {/* Label beside value, not above it — `orientation="row"` is the
              horizontal reading these tile lines want. */}
          <div className="flex flex-col gap-1 border-t border-white/[0.06] pt-2">
            {/* Premium is absent (not zero) whenever spot was unavailable. */}
            {showPremium && (
              <Stat orientation="row">
                <Stat.Label>vs spot</Stat.Label>
                <Stat.Value
                  absent={token.premiumPct === undefined}
                  tint={
                    token.premiumPct === undefined
                      ? undefined
                      : changeColor(token.premiumPct)
                  }
                >
                  {token.premiumPct === undefined
                    ? "—"
                    : formatChangePct(token.premiumPct)}
                </Stat.Value>
              </Stat>
            )}
            <Stat orientation="row">
              <Stat.Label>mkt cap</Stat.Label>
              <Stat.Value absent={!(token.marketCap > 0)}>
                {token.marketCap > 0 ? money.compact(token.marketCap) : "—"}
              </Stat.Value>
            </Stat>
            <Stat orientation="row">
              <Stat.Label>vaulted</Stat.Label>
              <Stat.Value absent={!(token.ounces > 0)}>
                {token.ounces > 0 ? `${formatCompact(token.ounces)} oz` : "—"}
              </Stat.Value>
            </Stat>
          </div>
        </div>
      </div>
    </div>
  );
}

function TokenizedGold({ config }: { config: z.output<typeof schema> }) {
  const { tokens, isLoading } = useTokenizedGold();

  if (isLoading && tokens.length === 0)
    return <FrameStatus loading>loading gold tokens…</FrameStatus>;
  if (tokens.length === 0)
    return <FrameStatus>no tokenized-gold data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div
        className="grid min-h-0 flex-1 gap-2 overflow-hidden"
        style={{
          gridTemplateColumns: `repeat(${Math.min(
            tokens.length,
            2,
          )}, minmax(0, 1fr))`,
        }}
      >
        {tokens.map((token) => (
          <TokenTile
            key={token.id}
            token={token}
            showPremium={config.showPremium}
          />
        ))}
      </div>
      {config.showPremium && (
        <div className="caption text-soft">
          1 token = 1 troy oz · a positive premium is the wrapper trading above
          the metal
        </div>
      )}
    </div>
  );
}

export const tokenizedGoldFrame = defineFrame({
  ...tokenizedGoldMeta,
  component: TokenizedGold,
});
