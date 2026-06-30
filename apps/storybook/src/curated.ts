/**
 * Per-frame overrides for the story factory. Optional — every frame falls back
 * to `buildDefaultConfig` + schema-derived enum/boolean variants. We only curate
 * where the auto-seed renders blank (a real image/video URL, a real target date)
 * or where a hand-picked variant set (real tickers) reads better than the
 * schema permutation alone.
 */
export type CuratedFrame = {
  /** Replaces the auto-derived baseline config for Default + as the variant base. */
  base?: Record<string, unknown>;
  /** Extra showcase variants, merged ahead of the schema-derived ones. */
  variants?: { label: string; config: Record<string, unknown> }[];
};

export const curated: Record<string, CuratedFrame> = {
  image: {
    base: {
      url: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=900&q=70",
      alt: "Trading desk",
    },
  },
  video: {
    base: {
      url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      title: "Market stream",
    },
  },
  countdown: {
    base: {
      target: "2026-12-31T23:59:59Z",
      label: "Year end",
      showTarget: true,
    },
  },
  "price-chart": {
    base: { symbol: "BTC", interval: "1h", mode: "candle" },
    variants: [
      {
        label: "BTC · candle · 1h",
        config: { symbol: "BTC", interval: "1h", mode: "candle" },
      },
      {
        label: "xyz:TSLA · candle · 1d",
        config: { symbol: "xyz:TSLA", interval: "1d", mode: "candle" },
      },
      {
        label: "xyz:NVDA · line · 4h",
        config: {
          symbol: "xyz:NVDA",
          interval: "4h",
          mode: "line",
          color: "#3fd08f",
        },
      },
      {
        label: "ETH · line · 15m",
        config: { symbol: "ETH", interval: "15m", mode: "line" },
      },
    ],
  },
};
