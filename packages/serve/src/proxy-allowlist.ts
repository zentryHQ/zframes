/**
 * TRANSITIONAL: the hosts the IN-REPO provider fleet contacts.
 *
 * The relay itself no longer reads this list. `handleProxy` allows only what
 * its mount passes (`ProxyOptions.allowHosts`, empty by default), and the two
 * mounts that still bundle the fleet pass this constant explicitly, so the
 * choice is visible at the mount instead of compiled into the relay.
 *
 * Where this is going: each adapter declares the hosts it contacts in its
 * plugin manifest (`ProviderPluginManifest.hosts`, @zframes/spec), and a mount
 * derives its allowlist with `proxyHostsOf(installedManifests)`. Then this file
 * goes away with the bundled fleet, and a zframes install authorises exactly
 * the hosts belonging to adapters its operator chose to install.
 *
 * It stays an allowlist (never an open proxy) either way, so a dashboard or
 * page cannot turn the local serve process into an SSRF relay to arbitrary or
 * internal hosts.
 */
export const PROXY_ALLOW_HOSTS = new Set<string>([
  "data.sec.gov",
  "www.sec.gov",
  "efts.sec.gov",
  "www.federalreserve.gov",
  "www.financialresearch.gov",
  "www.nasdaqtrader.com",
  "www.nyse.com",
  "markets.newyorkfed.org",
  "api.fiscaldata.treasury.gov",
  "home.treasury.gov",
  "api.bls.gov",
  "cdn.finra.org",
  // Central-bank FX history + FRED's own chart-download CSV, all keyless but
  // CORS-blocked, and each the only source for pairs/depth nothing CORS-open
  // publishes. They answer CSV rather than JSON, which the relay passes through
  // untouched.
  //   fred.stlouisfed.org — the keyless `fredgraph.csv` path (no API key on that
  //     route), serving TWO provider families: Fed H.10 FX dailies for
  //     provider-fx (DEXTHUS is the only US-official daily USD/THB series, and
  //     the Bank of Thailand has no keyless API at all), and the index /
  //     credit-spread / house-price / mortgage-rate series for provider-fred.
  //   www.bankofengland.co.uk — IADB CSV, daily GBP spot back to 1975-01-02
  //     (the deepest daily FX history found), several series per request.
  //   www.rba.gov.au — one daily CSV with the widest APAC basket from a central
  //     bank (23 AUD pairs incl. THB/VND/IDR/PGK/TWD).
  "fred.stlouisfed.org",
  "www.bankofengland.co.uk",
  "www.rba.gov.au",
  // FHFA House Price Index datasets — keyless, no CORS header. Note the
  // combined `hpi_master.csv` is ~17 MB, over PROXY_MAX_BYTES; provider-fhfa
  // reads the far smaller per-level files instead.
  "www.fhfa.gov",
  // News-outlet RSS feeds (CORS-blocked, so the news-feed frame reads them
  // through here). Headlines + links only; no keys.
  "www.coindesk.com",
  "cointelegraph.com",
  "decrypt.co",
  "www.cnbc.com",
  "www.nasdaq.com",
  "news.google.com",
  // Deep-dive sources. All keyless, none sends `Access-Control-Allow-Origin`,
  // so the browser can only reach them here.
  //
  //   api.nasdaq.com — the exchange's own quote-page backend: real consolidated
  //     daily OHLCV, market cap / 52-week / dividend / analyst target, 4-year
  //     income-balance-cashflow-ratio tables, reported-vs-consensus earnings
  //     with report dates, the market-wide earnings calendar, sell-side
  //     consensus, and 13F ownership aggregates. UNDOCUMENTED: it is the site's
  //     internal API, not a published data programme like SEC or Treasury —
  //     there is no stability contract, it wants a browser User-Agent, and it
  //     may rate-limit or block. Every provider method built on it caches with
  //     stale-on-error and degrades to an empty card, never a crash.
  //   cdn.cboe.com — serves TWO families off one host, which is why one entry
  //     covers both halves of the deep dive:
  //       · delayed (15 min) listed option chains with IV, open interest, volume
  //         and full greeks; ~1.7 MB per equity underlying, 3.4 MB for GLD, so
  //         comfortably under PROXY_MAX_BYTES. The same route answers for metal
  //         ETFs (GLD/SLV/IAU/PPLT/CPER), which is how gold gets an options
  //         surface without a provider of its own.
  //       · the published commodity implied-volatility index history (GVZ gold,
  //         VXSLV silver, VXGDX miners, OVX oil) — the metals counterpart of the
  //         VIX, since a metal has no earnings and its own vol regime is how
  //         "expensive" gets answered. Small CSVs, ~90–160 KB each, back to 2009.
  "api.nasdaq.com",
  "cdn.cboe.com",
]);
