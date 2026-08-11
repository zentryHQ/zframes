# The interview (first run = onboarding)

Read this before asking the user anything on the **create** path. Skip it
entirely for serve / update / fork requests.

The interview has **one job: choose which tickers fill the dashboard** (plus,
optionally, the look). It never decides *which frames* — you curate the set
yourself (`references/design.md`); the funnel only picks the *symbols* that
populate it. Keep it to a short three-step funnel, each step narrowing from the
one before:

1. **Stocks, crypto, or both?** The asset class. This is the only answer that
   changes the frame set — it gates the asset-specific frames (US-stock frames
   like `short-volume` for stocks; `bitcoin-dominance` / `tvl-treemap` for
   crypto; *both* → all of them). If they're vague, default to **stocks**.
2. **Which categories?** Built from their step-1 answer, so they pick from groups
   instead of recalling tickers cold. Offer a short multi-select menu (≤4 options
   — pick the subset that fits what they said; don't dump the whole palette):
   - **Stocks** → the `xyz` dex is **cross-asset**, so the groups span asset
     classes, not just equity sectors: equities *Big Tech, Semiconductors &
     Memory, AI & Data-Center, Crypto-adjacent, EV & Auto, Space & Defense,
     Consumer & Health* — plus *Indices* (S&P 500, Nasdaq-100), *Commodities*
     (metals, energy), and *FX* (EUR/JPY/GBP). The **xyz symbol reference** below
     maps every group to its valid tickers.
   - **Crypto** → themes: *Majors (BTC/ETH), Layer-1s, DeFi, Layer-2s, AI,
     Memecoins*.
   - **Both** → offer both groupings.
3. **Any in particular?** Within the chosen categories, ask them to name **3–5
   specific tickers** (free text — "NVDA, TSLA, AAPL"). Show and accept **plain
   tickers only**; the `xyz:` HIP-3 dex prefix is a framework internal you add
   silently when writing the spec ("TSLA" → `xyz:TSLA`; crypto stays bare). If
   they don't have specific names, **you pick representative liquid tickers** from
   their chosen categories — don't send them off to research. Note which 1–2 are
   the **main focus**; those drive the hero chart. If unsaid, take the first two.

**Optionally, a look.** Step 2's round may carry ONE extra question: which
**theme preset** the board should wear — ≤4 options picked from the summary's
preset list to fit the desk ("zframes — signature indigo (default)",
"Terminal — phosphor green, mono", "Gold Noir — luxe serif", …), each labelled
by its feel, never by config values. Skip the question entirely when the user
already signalled a vibe ("terminal look", "make it classy") or clearly doesn't
care — you choose either way when applying the look (`references/design.md`,
step 4a). Never let it add a fourth round.

That's the whole interview. Everything else — the frame set, zones, headings,
layout, default config — is your call from the design method; never ask about
it, and never read back frame or widget names as options.

This maps cleanly onto `AskUserQuestion`: step 1 is one question; step 2's options
are built from step-1's answer (a second round, not the same call — the look
question rides in this round); step 3 is the free-text "Other" field. Label
every option by **asset / category / ticker / look**, never by frame name.

For "update my dashboard" requests, skip the funnel — read the existing
`dashboard.json` first and change only what they asked for.

## xyz symbol reference (valid tickers by category)

The interview yields plain tickers; you write `xyz:<TICKER>`. `xyz` is the only
liquid HIP-3 dex — every symbol below lives there. Pick from this list so you
never emit a ticker the dex doesn't carry.

| Category | Liquid tickers — write `xyz:…` |
|---|---|
| **Indices** | `XYZ100` (Nasdaq-100), `SP500` (S&P 500) · thin: `JP225` `KR200` `NIFTY` `DXY` `VIX` |
| **Big Tech** | `AAPL` `MSFT` `GOOGL` `AMZN` `META` `NVDA` `ORCL` |
| **Semiconductors & Memory** | `MU` `SKHX` `SNDK` `DRAM` `NVDA` `AMD` `AVGO` `ARM` `TSM` `MRVL` `QCOM` · ETF `SMH` |
| **AI & Data-Center** | `PLTR` `NBIS` `CRWV` `BE` |
| **Crypto-adjacent** | `MSTR` `COIN` `HOOD` `CRCL` |
| **EV & Auto** | `TSLA` `RIVN` `HYUNDAI` |
| **Space & Defense** | `SPCX` (SpaceX) `RKLB` |
| **Commodities** | metals `GOLD` `SILVER` `COPPER` `PLATINUM` `PALLADIUM` · energy `CL` (WTI) `BRENTOIL` `NATGAS` · ETFs `XLE` `URNM` |
| **FX** | `EUR` `JPY` `NOK` `GBP` |
| **Consumer & Health** | `NFLX` `COST` `DKNG` `GME` `HIMS` `LLY` `BABA` `BX` |

Gotchas: it's `xyz:SP500` (**not `SPY`** — that symbol doesn't exist on the dex),
`xyz:XYZ100` for the Nasdaq-100 (not `NDX`/`QQQ`), `xyz:CL` for WTI crude (not
`WTI`/`USOIL`), `xyz:SPCX` for SpaceX. Crypto stays bare (`BTC`, `ETH`). Ignore
the other HIP-3 dexes (`km`/`flx`/`vntl`/…) — they're ~$0 volume; only `xyz` has
liquidity.
