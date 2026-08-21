/**
 * The keyless fleet as an installable provider plugin.
 *
 * This module is the `ProviderPlugin` shape (`manifest` + `createProviders`),
 * so the same 29 providers the apps compose today can also be *discovered* by a
 * host that imports nothing about them. Three consumers read the manifest and
 * nothing else: `zframes providers` (what an assembling agent may pin), the
 * serve proxy allowlist (derived from `hosts`, see `proxyHostsOf`), and the
 * per-installation AI catalogue (whose `source` vocabulary comes from
 * `sources`). Every field below is transcribed from the code that does the
 * fetching, never from documentation about it.
 *
 * `termsUrl` is deliberately absent. Twenty-nine independent upstreams have no
 * single terms page, and pointing the install-time notice at one of them (or at
 * a zframes page pretending to speak for them) would be worse than showing the
 * operator nothing: the host omits the notice rather than misstating it. Per-
 * source terms are reachable from each credit's `url`.
 */
import type { Capability, ProviderPluginManifest } from "@zframes/spec";
import { createKeylessProviders } from "./index";

/**
 * The plugin factory. An alias, not a second implementation: the runtime,
 * explorer and Storybook still import `createKeylessProviders` directly, and
 * two factories that could drift is exactly the failure this package exists to
 * remove.
 */
export const createProviders = createKeylessProviders;

/**
 * Every capability the fleet advertises, grouped by the provider that serves it
 * in `KEYLESS_PROVIDERS` order so a reader can check a line against one file.
 * Duplicates are dropped at their second appearance and noted, because which
 * provider wins is first-match routing, not this list.
 *
 * `manifest.test.ts` compares this set against what `createKeylessProviders()`
 * actually advertises, so a renamed or added provider capability fails there
 * rather than silently dropping out of `zframes providers`.
 */
const CAPABILITIES: readonly Capability[] = [
  // provider-hyperliquid
  "quote-stream",
  "day-stats",
  "funding-history",
  "ohlcv",
  "open-interest",
  "funding-comparison",
  // provider-defillama
  "tvl",
  "dex-volume",
  "protocol-tvl",
  "protocol-fees",
  "protocol-fundamentals",
  "token-unlocks",
  "stablecoins",
  "yields",
  "fees-overview",
  // provider-alternativeme
  "sentiment",
  // provider-coingecko
  "global-market",
  "coin-markets",
  "trending-coins",
  "sector-performance",
  "nft-market",
  "crypto-profile",
  // provider-coinpaprika
  "coin-movers",
  // provider-geckoterminal
  "dex-pools",
  // provider-blockchair
  "chain-activity",
  // provider-coinmetrics
  "onchain-valuation",
  "price-history-daily",
  // provider-bitcoin-data
  "onchain-cycle-extras",
  // provider-ultrasound
  "eth-supply",
  // provider-polymarket
  "prediction-markets",
  // provider-etf-flows
  "etf-flows",
  // provider-nyfed
  "reference-rates",
  // provider-treasury
  "treasury-rates",
  "yield-curve",
  "treasury-auctions",
  "national-debt",
  // provider-bls
  "macro-series",
  // provider-sec
  "filings",
  "fundamentals",
  "fundamentals-history",
  // provider-finra
  "short-volume",
  // provider-nasdaq (also day-stats + ohlcv, reachable only by pinning
  // `source: "nasdaq"` because it sits after Hyperliquid in routing order)
  "equity-profile",
  "equity-financials",
  "earnings-history",
  "earnings-calendar",
  "analyst-ratings",
  "institutional-ownership",
  // provider-cboe
  "options-chain",
  // provider-ofr
  "financial-stress",
  // provider-fred
  "index-level",
  "credit-spread",
  "housing-price",
  "mortgage-rate",
  "macro-reference-series",
  // provider-zillow
  "home-value-index",
  // provider-fhfa
  "regional-housing-price",
  // provider-fx
  "fx-rates",
  "dollar-index",
  // provider-metals
  "metal-spot",
  "metal-history",
  "metal-positioning",
  "gold-reserve",
  "tokenized-gold",
  "commodity-vol-index",
  // provider-news
  "news",
  // provider-mempool
  "btc-fees",
  "btc-mempool",
  "btc-blocks",
  "btc-hashrate",
  "btc-difficulty",
  "mining-pools",
  "lightning-stats",
  // provider-deribit (also options-chain)
  "options-summary",
  "volatility-index",
  // provider-bitkub (also day-stats + ohlcv, reached by pinning
  // `source: "bitkub"`)
  "order-book",
];

/**
 * Hosts the fleet contacts.
 *
 * `proxied` is set on exactly the entries in serve's `PROXY_ALLOW_HOSTS`: those
 * are the hosts that send no `Access-Control-Allow-Origin`, so a browser can
 * only reach them through the relay, and the frames that need them degrade to
 * empty on a static host with no runtime. Everything else is CORS-open and
 * fetched directly, which is why it needs no relay entry.
 *
 * Two sources of truth were reconciled here: the request URLs in the provider
 * packages, and serve's allowlist. Six allowlisted hosts are NOT requested by
 * any shipping provider today (`efts.sec.gov`, `www.federalreserve.gov`,
 * `www.nasdaqtrader.com`, `www.nyse.com`, `www.bankofengland.co.uk`,
 * `www.rba.gov.au`) and two are requested unproxied even though they are
 * allowlisted (`api.bls.gov`, `markets.newyorkfed.org`). They are all carried
 * with `proxied: true` regardless, because while both lists exist the allowlist
 * is what actually governs the relay, and a manifest that quietly narrowed it
 * would revoke reach the running proxy still grants. `tests/keyless-proxy-hosts.test.ts`
 * pins the two lists equal so neither can drift; when serve switches to the
 * derived allowlist, dropping an entry here is what retires it.
 */
const HOSTS = [
  // Official/open data surfaces. CORS-blocked, hence relayed.
  {
    host: "data.sec.gov",
    proxied: true,
    reason: "SEC XBRL company facts and submission history.",
  },
  {
    host: "www.sec.gov",
    proxied: true,
    reason: "EDGAR filing archives for a company's individual filings.",
  },
  {
    host: "efts.sec.gov",
    proxied: true,
    reason:
      "EDGAR full-text search. Allowlisted; no shipping provider calls it.",
  },
  {
    host: "www.federalreserve.gov",
    proxied: true,
    reason:
      "Fed statistical releases. Allowlisted; no shipping provider calls it.",
  },
  {
    host: "www.financialresearch.gov",
    proxied: true,
    reason: "The OFR Financial Stress Index CSV.",
  },
  {
    host: "www.nasdaqtrader.com",
    proxied: true,
    reason:
      "Nasdaq Trader listings. Allowlisted; no shipping provider calls it.",
  },
  {
    host: "www.nyse.com",
    proxied: true,
    reason: "NYSE market data. Allowlisted; no shipping provider calls it.",
  },
  {
    host: "markets.newyorkfed.org",
    proxied: true,
    reason: "NY Fed reference rates (SOFR, EFFR, OBFR), latest snapshot.",
  },
  {
    host: "api.fiscaldata.treasury.gov",
    proxied: true,
    reason:
      "Treasury Fiscal Data: average interest rates, debt to the penny, auction results, monthly gold reserve.",
  },
  {
    host: "home.treasury.gov",
    proxied: true,
    reason: "The daily Treasury yield-curve XML.",
  },
  {
    host: "api.bls.gov",
    proxied: true,
    reason: "BLS public timeseries API for the macro series.",
  },
  {
    host: "cdn.finra.org",
    proxied: true,
    reason: "FINRA daily consolidated short-sale volume files.",
  },
  // Central-bank / FRED CSV routes: keyless but CORS-blocked, and each the only
  // source for depth nothing CORS-open publishes. They answer CSV, which the
  // relay passes through untouched.
  {
    host: "fred.stlouisfed.org",
    proxied: true,
    reason:
      "The keyless fredgraph.csv route: index, credit-spread, house-price and mortgage-rate series.",
  },
  {
    host: "www.bankofengland.co.uk",
    proxied: true,
    reason:
      "IADB CSV, daily GBP spot back to 1975. Allowlisted; no shipping provider calls it.",
  },
  {
    host: "www.rba.gov.au",
    proxied: true,
    reason:
      "One daily CSV with the widest APAC central-bank basket. Allowlisted; no shipping provider calls it.",
  },
  {
    host: "www.fhfa.gov",
    proxied: true,
    reason:
      "FHFA quarterly House Price Index datasets, read per level because the combined file is ~17 MB.",
  },
  // News-outlet RSS. Headlines and links only, no keys.
  {
    host: "www.coindesk.com",
    proxied: true,
    reason: "CoinDesk RSS headlines.",
  },
  {
    host: "cointelegraph.com",
    proxied: true,
    reason: "Cointelegraph RSS headlines.",
  },
  { host: "decrypt.co", proxied: true, reason: "Decrypt RSS headlines." },
  {
    host: "www.cnbc.com",
    proxied: true,
    reason: "CNBC markets RSS headlines.",
  },
  {
    host: "www.nasdaq.com",
    proxied: true,
    reason: "Nasdaq markets RSS headlines.",
  },
  {
    host: "news.google.com",
    proxied: true,
    reason: "Google News RSS search, for a per-topic feed.",
  },
  // Deep-dive sources.
  {
    host: "api.nasdaq.com",
    proxied: true,
    reason:
      "The exchange's UNDOCUMENTED quote-page backend: consolidated daily OHLCV, profile, financials, earnings, consensus and 13F ownership. No stability contract, so every call caches stale-on-error.",
  },
  {
    host: "cdn.cboe.com",
    proxied: true,
    reason:
      "Two families off one host: delayed option chains with greeks, and the commodity implied-volatility index history (GVZ, VXSLV, VXGDX, OVX).",
  },
  // CORS-open hosts, fetched straight from the browser. No relay entry.
  {
    host: "api.hyperliquid.xyz",
    reason: "Hyperliquid info POSTs, plus the shared wss://…/ws quote stream.",
  },
  {
    host: "api.llama.fi",
    reason:
      "DeFiLlama chains, DEX and fee overviews, protocols, per-protocol TVL.",
  },
  {
    host: "stablecoins.llama.fi",
    reason: "Stablecoin supply by asset and by chain.",
  },
  { host: "yields.llama.fi", reason: "DeFi yield pools." },
  {
    host: "defillama-datasets.llama.fi",
    reason: "Token unlock and emission schedules.",
  },
  { host: "api.alternative.me", reason: "The crypto Fear & Greed index." },
  {
    host: "api.coingecko.com",
    reason:
      "Global market, coin markets, categories, NFTs, coin profiles, and the tokenized-gold quotes.",
  },
  {
    host: "api.coinpaprika.com",
    reason: "USD tickers for the top-movers scan.",
  },
  { host: "api.geckoterminal.com", reason: "DEX pool listings." },
  { host: "api.blockchair.com", reason: "Per-chain activity stats." },
  {
    host: "community-api.coinmetrics.io",
    reason:
      "Community asset-metric timeseries: on-chain valuation and daily price history.",
  },
  { host: "bitcoin-data.com", reason: "Bitcoin cycle extras." },
  { host: "ultrasound.money", reason: "ETH supply and burn." },
  {
    host: "gamma-api.polymarket.com",
    reason: "Prediction-market listings and prices.",
  },
  { host: "api.sosovalue.xyz", reason: "Spot-ETF flow histories." },
  {
    host: "api.frankfurter.dev",
    reason: "ECB-derived FX reference rates, latest and windowed.",
  },
  {
    host: "api.fxratesapi.com",
    reason: "FX latest and timeseries, as a fallback leg.",
  },
  {
    host: "latest.currency-api.pages.dev",
    reason: "Mirrored daily FX snapshot, as a fallback leg.",
  },
  {
    host: "data-api.ecb.europa.eu",
    reason: "ECB SDMX daily exchange-rate series.",
  },
  { host: "api.gold-api.com", reason: "Metal spot quotes." },
  {
    host: "prices.lbma.org.uk",
    reason: "The LBMA daily London precious-metal fixes.",
  },
  {
    host: "publicreporting.cftc.gov",
    reason: "CFTC Commitments of Traders positioning.",
  },
  {
    host: "files.zillowstatic.com",
    reason: "The Zillow Research ZHVI metro CSV.",
  },
  {
    host: "mempool.space",
    reason:
      "Bitcoin fees, mempool, blocks, hashrate, difficulty, mining pools, Lightning stats.",
  },
  {
    host: "www.deribit.com",
    reason: "Public options summaries, chains and the volatility index.",
  },
  {
    host: "api.bitkub.com",
    reason: "Bitkub tickers, candles and order book, THB-quoted.",
  },
] as const;

/**
 * The fleet's data-provenance credits, transcribed from `SOURCES` in
 * `packages/frames/src/schemas/shared.ts` (the record 245 frame-meta
 * declarations already reference).
 *
 * IDS match `SOURCES` exactly, and `tests/keyless-source-credits.test.ts` is
 * what keeps it that way while both lists exist. Six of those keys are
 * camelCase (`alternativeMe`, `nyFed`, `secEdgar`, `coinMetrics`,
 * `bitcoinData`, `goldApi`) while the plugin contract's id regex admits
 * lowercase and dashes only; `withSourceIds` therefore derives the id from the
 * key (`nyFed` becomes `ny-fed`), so the frame metas keep their readable
 * property access and the ids keep the one shape a manifest can carry. Every
 * id a card can actually PIN is a single-word key (`sourceField()`:
 * hyperliquid, bitkub, nasdaq), so the derivation is the identity there and no
 * existing board repoints.
 *
 * Every `SOURCES` entry is a keyless upstream, so none is skipped: the keyed
 * tier (Binance, wallet) contributes no credit to that record.
 */
const SOURCES: ProviderPluginManifest["sources"] = [
  {
    id: "hyperliquid",
    name: "Hyperliquid",
    url: "https://hyperliquid.xyz",
    // The three venue notes are split from one `sourceField()` .describe() —
    // the only place the repo documents per-venue symbol conventions, and
    // exactly what an assembling agent gets wrong without them.
    notes:
      'Default venue: crypto plus HIP-3 stock and commodity perps, USD-quoted. Symbols are bare tickers ("BTC") or dex-prefixed perps ("xyz:TSLA").',
  },
  { id: "defillama", name: "DeFiLlama", url: "https://defillama.com" },
  { id: "coingecko", name: "CoinGecko", url: "https://www.coingecko.com" },
  {
    id: "alternative-me",
    name: "alternative.me",
    url: "https://alternative.me/crypto/fear-and-greed-index/",
  },
  { id: "bls", name: "BLS", url: "https://www.bls.gov" },
  {
    id: "ny-fed",
    name: "NY Fed",
    url: "https://www.newyorkfed.org/markets/reference-rates",
  },
  {
    id: "treasury",
    name: "U.S. Treasury",
    url: "https://fiscaldata.treasury.gov",
  },
  { id: "sec-edgar", name: "SEC EDGAR", url: "https://www.sec.gov/edgar" },
  {
    id: "finra",
    name: "FINRA",
    url: "https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data",
  },
  {
    id: "ofr",
    name: "OFR",
    url: "https://www.financialresearch.gov/financial-stress-index/",
  },
  { id: "mempool", name: "mempool.space", url: "https://mempool.space" },
  { id: "deribit", name: "Deribit", url: "https://www.deribit.com" },
  { id: "coinpaprika", name: "Coinpaprika", url: "https://coinpaprika.com" },
  {
    id: "frankfurter",
    name: "Frankfurter (ECB)",
    url: "https://frankfurter.dev",
  },
  { id: "coin-metrics", name: "Coin Metrics", url: "https://coinmetrics.io" },
  {
    id: "bitcoin-data",
    name: "bitcoin-data.com",
    url: "https://bitcoin-data.com",
  },
  {
    id: "ultrasound",
    name: "ultrasound.money",
    url: "https://ultrasound.money",
  },
  { id: "polymarket", name: "Polymarket", url: "https://polymarket.com" },
  { id: "sosovalue", name: "SoSoValue", url: "https://sosovalue.com" },
  {
    id: "geckoterminal",
    name: "GeckoTerminal",
    url: "https://www.geckoterminal.com",
  },
  { id: "blockchair", name: "Blockchair", url: "https://blockchair.com" },
  {
    id: "bitkub",
    name: "Bitkub",
    url: "https://www.bitkub.com",
    notes:
      'Thailand\'s largest exchange, THB-quoted, the source where KUB trades. Lists bare tickers like "KUB" or "BTC" and has no HIP-3 stock perps.',
  },
  {
    id: "gold-api",
    name: "gold-api.com",
    url: "https://gold-api.com",
    notes:
      "Spot universe: XAU gold, XAG silver, XPT platinum, XPD palladium, HG copper. Copper is quoted per pound, the rest per troy ounce.",
  },
  {
    id: "lbma",
    name: "LBMA",
    url: "https://www.lbma.org.uk/prices-and-data/precious-metal-prices",
    notes:
      "Publishes a daily London fix for XAU, XAG, XPT and XPD only, so a copper (HG) history or ratio card has no fix to read. Gold and silver go back to 1968, platinum and palladium to 1990.",
  },
  {
    id: "cftc",
    name: "CFTC",
    url: "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm",
  },
  {
    id: "fred",
    name: "FRED",
    url: "https://fred.stlouisfed.org",
    notes:
      "Index series are SP500, VIXCLS and NASDAQCOM. SP500 is redistributed under licence with only a ~10-year rolling window while NASDAQCOM runs back to 1971, so asking for more years than a series carries just shows everything there is.",
  },
  {
    id: "zillow",
    name: "Zillow Research",
    url: "https://www.zillow.com/research/data/",
  },
  { id: "fhfa", name: "FHFA", url: "https://www.fhfa.gov/data/hpi" },
  {
    id: "nasdaq",
    name: "Nasdaq",
    url: "https://www.nasdaq.com",
    notes:
      'The real consolidated tape for US-listed stocks, DAILY bars only: no intraday, no crypto. Wants a plain US ticker like "NVDA". Pin it when a stock card should show the actual listing rather than its perp, since the HIP-3 perp tracks direction but its volume and open interest are Hyperliquid\'s book. It only answers for symbols a card names, so it cannot back a card that scans a whole universe.',
  },
  { id: "cboe", name: "Cboe", url: "https://www.cboe.com" },
];

/**
 * What the keyless fleet declares about itself.
 *
 * `synthetic` is unset: every number here comes off a live upstream, and the
 * flag is what the chrome watermarks on. `requiresCredentials` is unset too —
 * keyless is the whole point of this set, and the keyed tier
 * (`provider-binance`, `provider-wallet`) is a separate plugin that this
 * package deliberately never imports.
 */
export const KEYLESS_MANIFEST: ProviderPluginManifest = {
  id: "keyless",
  name: "Keyless market data",
  description:
    "Free, no-key public market data: crypto and HIP-3 equity perps, US official statistics, FX, metals, housing and news.",
  capabilities: CAPABILITIES,
  sources: SOURCES,
  hosts: HOSTS,
};
