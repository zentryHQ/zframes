import { defineFrameMeta } from "@zframes/spec/frame";
import { z } from "zod";
import { validateCustomUrl } from "../custom-data-shared";
import { widgetIcon } from "./shared";

export const clockMeta = defineFrameMeta({
  name: "clock",
  label: "Clock",
  category: "tools",
  iconUrl: widgetIcon("clock"),
  layout: { w: 3, h: 2, minW: 2, minH: 2, maxW: 4, maxH: 3 },
  description:
    "Digital clock showing the current time, ticking every second. Configurable IANA timezone (defaults to the viewer's local zone), 12/24-hour format, optional seconds and date, the timezone abbreviation, and a caption label. Drop several with different timezones for a trading-desk world clock. Needs no data provider.",
  capabilities: [],
  schema: z.object({
    timezone: z
      .string()
      .default("")
      .describe(
        'IANA timezone, e.g. "America/New_York", "Europe/London", "Asia/Tokyo", "UTC". Empty = the viewer\'s local timezone.',
      ),
    label: z
      .string()
      .default("")
      .describe(
        'Caption under the time, e.g. "New York" or "Local". Empty hides it.',
      ),
    hour12: z
      .boolean()
      .default(false)
      .describe("12-hour clock with AM/PM (true) or 24-hour (false)."),
    showSeconds: z
      .boolean()
      .default(true)
      .describe("Show seconds (HH:MM:SS) instead of just HH:MM."),
    showMillis: z
      .boolean()
      .default(false)
      .describe(
        "Show milliseconds (HH:MM:SS.mmm), updated smoothly each animation frame. Implies seconds.",
      ),
    showDate: z
      .boolean()
      .default(false)
      .describe("Show the weekday and date under the time."),
    showTimezone: z
      .boolean()
      .default(true)
      .describe(
        'Show the timezone abbreviation (e.g. "EST", "GMT+7", "UTC") in the caption. Combines with the label when set, e.g. "New York · EST".',
      ),
  }),
});

export const marketHoursMeta = defineFrameMeta({
  name: "market-hours",
  label: "Market Hours",
  category: "tools",
  iconUrl: widgetIcon("market-hours"),
  layout: { w: 4, h: 4, minW: 4, minH: 2 },
  description:
    "Which world stock exchanges are open right now — each row shows an open / closed / holiday status dot and a live countdown to the next open or close. Computed entirely client-side from each exchange's timezone and regular trading hours (no API); a bundled 2026 holiday list keeps the major Western exchanges accurate on market holidays. Intraday lunch breaks and half-day early closes are not modelled. Needs no data provider.",
  capabilities: [],
  schema: z.object({
    exchanges: z
      .array(z.string())
      .default([])
      .describe(
        'Exchange codes to show, e.g. ["NYSE","LSE","TSE","HKEX","SET"]. Empty = a global default set. Known codes: NYSE, NASDAQ, TSX, B3, LSE, XETRA, EURONEXT, SIX, TSE, HKEX, SSE, NSE, KRX, SGX, SET, ASX, JSE, TADAWUL.',
      ),
    sort: z
      .enum(["region", "status", "name"])
      .default("region")
      .describe(
        "Order rows by world region (Americas → Europe → Asia-Pacific → Middle East/Africa), by status (open first), or alphabetically by name.",
      ),
  }),
});

export const countdownMeta = defineFrameMeta({
  name: "countdown",
  label: "Countdown",
  category: "tools",
  iconUrl: widgetIcon("countdown"),
  layout: { w: 3, h: 2, minW: 2, minH: 2, maxW: 4, maxH: 3 },
  description:
    "Live countdown to a target date and time — FOMC decisions, CPI prints, options expiry, earnings, a token unlock, the next market open. Counts down in days / hours / minutes / seconds, ticking every second, and flips to a 'reached' state once the moment passes. Needs no data provider.",
  capabilities: [],
  schema: z.object({
    target: z
      .string()
      .default("")
      .describe(
        'The moment to count down to, as an ISO 8601 string. Add a timezone for an unambiguous instant, e.g. "2026-07-30T18:00:00-04:00" or "2026-12-31T23:59:59Z"; a bare "2026-07-30T18:00" is read in the viewer\'s local timezone. Empty shows a "set a target" prompt.',
      ),
    label: z
      .string()
      .default("")
      .describe(
        'Caption above the countdown, e.g. "FOMC Decision". Empty hides it.',
      ),
    showTarget: z
      .boolean()
      .default(true)
      .describe("Show the formatted target date and time under the countdown."),
  }),
});

export const linkGridMeta = defineFrameMeta({
  name: "link-grid",
  label: "Quick Links",
  category: "tools",
  iconUrl: widgetIcon("link-grid"),
  layout: { w: 3, h: 2, minW: 2, minH: 1, maxH: 3 },
  description:
    "A grid of quick-launch tiles linking to your favourite sites — TradingView, exchanges, news, docs, your own dashboards. Each tile opens in a new tab and shows the destination site's favicon by default (fetched keyless from a public favicon service), with an optional per-link icon override and a first-letter fallback. Needs no data provider.",
  capabilities: [],
  chrome: "plain",
  schema: z.object({
    links: z
      .array(
        z.object({
          label: z
            .string()
            .min(1)
            .describe('Tile caption, e.g. "TradingView".'),
          url: z
            .string()
            .min(1)
            .describe("Destination URL (https). Opens in a new tab."),
          icon: z
            .string()
            .default("")
            .describe(
              "Optional icon override: an emoji (e.g. \"📈\") or an https image URL. Empty uses the destination site's favicon, falling back to the label's first letter.",
            ),
        }),
      )
      .min(1)
      .default([
        {
          label: "TradingView",
          url: "https://www.tradingview.com",
          icon: "📈",
        },
        {
          label: "Hyperliquid",
          url: "https://app.hyperliquid.xyz",
          icon: "⚡",
        },
      ])
      .describe("The links to show as tiles. At least one."),
    columns: z
      .number()
      .int()
      .min(1)
      .max(4)
      .default(2)
      .describe("How many tiles per row."),
  }),
});

export const calculatorMeta = defineFrameMeta({
  name: "calculator",
  label: "Position Calculator",
  category: "tools",
  iconUrl: widgetIcon("calculator"),
  layout: { w: 3, h: 4, minW: 2, minH: 4, maxH: 5 },
  description:
    "Position-size & risk calculator. Enter account size, risk-per-trade %, entry and stop price; it computes the dollars at risk, the per-unit risk, the position size (units) that respects that risk budget, the resulting position value, and whether the setup is long or short. All math runs client-side — no data provider. Inputs are editable live; the configured values are the starting point.",
  capabilities: [],
  schema: z.object({
    account: z
      .number()
      .positive()
      .default(10000)
      .describe("Account size used as the risk base, in the quote currency."),
    riskPct: z
      .number()
      .positive()
      .max(100)
      .default(1)
      .describe("Percent of the account risked on the trade, e.g. 1 = 1%."),
    entry: z.number().positive().default(100).describe("Entry price."),
    stop: z
      .number()
      .positive()
      .default(95)
      .describe(
        "Stop-loss price. Its distance from entry sets the per-unit risk; below entry = long, above = short.",
      ),
    currency: z
      .string()
      .default("$")
      .describe("Currency symbol shown next to money values."),
  }),
});

export const diceMeta = defineFrameMeta({
  name: "dice",
  label: "Dice",
  category: "tools",
  iconUrl: widgetIcon("dice"),
  layout: { w: 2, h: 2, minW: 2, minH: 2, maxW: 2, maxH: 2 },
  description:
    "A click-to-decide widget — a random decision-maker with no data provider. Flip a coin (heads/tails), roll a die (1–6), or pick at random from your own list of options. Click the surface to re-roll. Use it to break a tie, pick what to trade, or settle any small decision.",
  capabilities: [],
  schema: z.object({
    mode: z
      .enum(["coin", "dice", "list"])
      .default("coin")
      .describe(
        "coin = heads/tails, dice = 1–6, list = random pick from options.",
      ),
    options: z
      .array(z.string())
      .default(["Yes", "No"])
      .describe("Choices used in list mode."),
    label: z
      .string()
      .default("")
      .describe("Optional caption, e.g. the question being decided."),
  }),
});

export const riskRewardMeta = defineFrameMeta({
  name: "risk-reward",
  // Stays in USD whatever the board asks for: user-typed trade levels.
  usdOnly: true,
  label: "Risk / Reward",
  category: "tools",
  iconUrl: widgetIcon("risk-reward"),
  layout: { w: 3, h: 3, minW: 2, minH: 2, maxH: 5 },
  description:
    "Risk:reward planner. Enter entry, stop-loss and profit-target prices; it computes the per-unit risk and reward, their percentages of entry, and the resulting R:R ratio, shown large above a two-segment bar (red risk leg vs green reward leg, sized to scale). Pure client-side math — no data provider. Complements the calculator frame by adding the target/reward leg the position sizer leaves out.",
  capabilities: [],
  schema: z.object({
    entry: z.number().default(100).describe("Planned entry price."),
    stop: z.number().default(95).describe("Stop-loss price."),
    target: z.number().default(115).describe("Profit target price."),
    direction: z
      .enum(["long", "short"])
      .default("long")
      .describe(
        "Trade direction. Long expects stop < entry < target; short expects target < entry < stop — used for labels and to flag a mismatched setup.",
      ),
    label: z.string().default("").describe("Optional caption."),
  }),
});

export const stopwatchMeta = defineFrameMeta({
  name: "stopwatch",
  label: "Stopwatch",
  layout: { w: 3, h: 2, minW: 2, minH: 2, maxW: 3, maxH: 2 },
  category: "tools",
  iconUrl: widgetIcon("stopwatch"),
  description:
    "A count-up stopwatch — time-in-trade, a focus session, how long a setup has been live. Start / Pause / Reset, ticking up in H:MM:SS, and it persists across reloads (the running state is saved into the dashboard, so it keeps counting where it left off). Runs entirely client-side — needs no data provider.",
  capabilities: [],
  schema: z.object({
    label: z.string().default("Session").describe("Caption above the timer."),
    startedAt: z
      .number()
      .default(0)
      .describe(
        "Epoch ms when the timer was last started; 0 = paused. Persisted automatically by the frame.",
      ),
    accumulatedMs: z
      .number()
      .default(0)
      .describe(
        "Milliseconds banked before the current run. Persisted automatically by the frame.",
      ),
  }),
});

export const sessionProgressMeta = defineFrameMeta({
  name: "session-progress",
  label: "Session Progress",
  category: "tools",
  iconUrl: widgetIcon("session-progress"),
  layout: { w: 3, h: 2, minW: 1, minH: 2, maxH: 2 },
  description:
    "A horizontal progress bar showing how far through today's trading session an exchange is — fills from open to close with a percent readout, and a 'closes in …' / 'opens in …' countdown. Pick any exchange code (NYSE, NASDAQ, LSE, TSX, B3, …); sessions are computed client-side from the exchange's timezone and hours, so it needs no data provider.",
  capabilities: [],
  schema: z.object({
    exchange: z
      .string()
      .default("NYSE")
      .describe("Exchange code: NYSE, NASDAQ, LSE, TSX, B3, …"),
    label: z
      .string()
      .default("")
      .describe("Optional caption shown by the exchange code."),
    showCountdown: z
      .boolean()
      .default(true)
      .describe("Show the time-to-open / time-to-close countdown."),
  }),
});

export const holidayCalendarMeta = defineFrameMeta({
  name: "holiday-calendar",
  label: "Holiday Calendar",
  category: "tools",
  iconUrl: widgetIcon("holiday-calendar"),
  layout: { w: 3, h: 4, minW: 2, minH: 2, maxH: 4 },
  description:
    "Upcoming market holidays (full closures) for a chosen exchange — the next few dates with their weekday and a countdown ('in 9d'). Pick any exchange code (NYSE, NASDAQ, LSE, TSX, B3, …); dates come from a bundled holiday table and are computed client-side, so it needs no data provider. Note: the bundled table currently covers 2026.",
  capabilities: [],
  schema: z.object({
    exchange: z
      .string()
      .default("NYSE")
      .describe("Exchange code: NYSE, NASDAQ, LSE, TSX, B3, …"),
    count: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5)
      .describe("How many upcoming holidays to list."),
    label: z
      .string()
      .default("")
      .describe("Optional caption shown above the list."),
  }),
});

export const dayMeterMeta = defineFrameMeta({
  name: "day-meter",
  label: "Day Meter",
  category: "tools",
  iconUrl: widgetIcon("day-meter"),
  layout: { w: 4, h: 2, minW: 3, minH: 2, maxH: 2 },
  description:
    "A strip of the current week's days for a chosen exchange — today highlighted, market holidays flagged in amber, and (optionally) non-trading days greyed. Computed client-side from the exchange's trading days + a bundled holiday table; needs no data provider.",
  capabilities: [],
  schema: z.object({
    exchange: z
      .string()
      .default("NYSE")
      .describe("Exchange code: NYSE, NASDAQ, LSE, TSX, B3, …"),
    weekdaysOnly: z
      .boolean()
      .default(true)
      .describe(
        "Show only the exchange's trading days; off shows the full 7-day week with weekends greyed.",
      ),
    label: z
      .string()
      .default("")
      .describe("Optional caption shown by the strip."),
  }),
});

export const returnsProjectorMeta = defineFrameMeta({
  name: "returns-projector",
  // Stays in USD whatever the board asks for: user-typed projection inputs.
  usdOnly: true,
  label: "Returns Projector",
  category: "tools",
  iconUrl: widgetIcon("returns-projector"),
  layout: { w: 3, h: 4, minW: 3, minH: 3 },
  description:
    "A compound-growth projector — enter a starting principal, a percent return per period, the number of periods, and an optional per-period contribution; it charts the projected balance curve and shows the ending value and total gain. Pure client-side math, no data provider; complements the position-size/risk `calculator`.",
  capabilities: [],
  schema: z.object({
    principal: z.number().default(1000).describe("Starting balance."),
    ratePct: z
      .number()
      .default(5)
      .describe("Return per period, in percent (e.g. 5 = 5%)."),
    periods: z
      .number()
      .int()
      .min(1)
      .max(600)
      .default(12)
      .describe("Number of compounding periods to project."),
    contribution: z
      .number()
      .default(0)
      .describe("Amount added at the end of each period."),
    label: z.string().default("").describe("Optional caption."),
  }),
});

export const breakevenMeta = defineFrameMeta({
  name: "breakeven",
  // Stays in USD whatever the board asks for: user-typed fills — a number must read back as entered.
  usdOnly: true,
  label: "Break-even",
  category: "tools",
  iconUrl: widgetIcon("breakeven"),
  layout: { w: 3, h: 4, minW: 2, minH: 3 },
  description:
    "A break-even / average-cost calculator — add your fills (price + size) and it computes the size-weighted average entry; set an optional current price to see the unrealized P&L %. Pure client-side math, no data provider.",
  capabilities: [],
  schema: z.object({
    fills: z
      .array(
        z.object({
          price: z.number().describe("Fill price."),
          size: z.number().describe("Fill size, in units."),
        }),
      )
      .default([{ price: 100, size: 1 }])
      .describe(
        "Your entry fills; their size-weighted average is the break-even.",
      ),
    currentPrice: z
      .number()
      .default(0)
      .describe(
        "Optional current price; greater than 0 shows the unrealized P&L %.",
      ),
    label: z.string().default("").describe("Optional caption."),
  }),
});

export const checklistMeta = defineFrameMeta({
  name: "checklist",
  label: "Checklist",
  category: "tools",
  iconUrl: widgetIcon("checklist"),
  layout: { w: 3, h: 3, minW: 1, minH: 2, maxH: 4 },
  description:
    "A tickable checklist — a pre-trade routine, a daily ritual, anything. Tap items to check them off; the checked state persists across reloads (saved into the dashboard). Client-side only, no data provider.",
  capabilities: [],
  schema: z.object({
    title: z
      .string()
      .default("Pre-trade checklist")
      .describe("Heading shown above the list."),
    items: z
      .array(z.string())
      .default([
        "Trend & bias aligned",
        "Stop level set",
        "Risk sized correctly",
      ])
      .describe("The checklist items, top to bottom."),
    checked: z
      .array(z.boolean())
      .default([])
      .describe(
        "Per-item checked state (by index); persisted automatically by the frame.",
      ),
  }),
});

export const pomodoroMeta = defineFrameMeta({
  name: "pomodoro",
  label: "Pomodoro",
  category: "tools",
  iconUrl: widgetIcon("pomodoro"),
  layout: { w: 3, h: 3, minW: 2, minH: 2, maxW: 3, maxH: 4 },
  description:
    "A Pomodoro focus timer — alternating work and break intervals with Start / Pause / Reset and a cycle counter, counting down in MM:SS. Runs entirely client-side with no data provider; timer state is in-session (not persisted).",
  capabilities: [],
  schema: z.object({
    workMin: z
      .number()
      .min(1)
      .max(180)
      .default(25)
      .describe("Work interval length, in minutes."),
    breakMin: z
      .number()
      .min(1)
      .max(120)
      .default(5)
      .describe("Break interval length, in minutes."),
    cycles: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(4)
      .describe("Work/break cycles before the counter loops."),
    label: z.string().default("").describe("Optional caption."),
  }),
});

export const customDataMeta = defineFrameMeta({
  name: "custom-data",
  label: "Custom Data",
  category: "tools",
  iconUrl: widgetIcon("custom-data"),
  layout: { w: 4, h: 3, minW: 2, minH: 2, maxW: 5, maxH: 4 },
  description:
    "The escape hatch: renders ANY keyless HTTPS JSON API as a stat, line chart, bars, or label→value table — for data no built-in frame covers (weather, sports, public stats, niche feeds). Fetches browser-direct, so the API must be CORS-open, need no key, and be public https (localhost/private hosts are refused). Point `values` at the JSON with a dot/bracket path — e.g. 'hourly.temperature_2m', 'data[0].price', 'items[*].name'. A path resolving to an array charts as a series; a scalar shows as a stat. Verify the URL and path against a real response before emitting them.",
  capabilities: [],
  schema: z.object({
    url: z
      .string()
      .min(1)
      .refine((u) => validateCustomUrl(u) === null, {
        message:
          "must be a public https:// URL (no credentials, no localhost/private hosts)",
      })
      .default(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      )
      .describe(
        "The JSON endpoint, public https only. Must be CORS-open and keyless — never embed an API key or token; the spec is shareable. Include query params in the URL.",
      ),
    values: z
      .string()
      .min(1)
      .max(200)
      .default("bitcoin.usd")
      .describe(
        "Dot/bracket path to the value(s) inside the response, e.g. 'hourly.temperature_2m' (array → series), 'data[0].price' (scalar → stat), 'items[*].volume' ([*] maps over an array). No expressions — keys, [indices], and [*] only.",
      ),
    labels: z
      .string()
      .max(200)
      .default("")
      .describe(
        "Optional path to a parallel array of labels — x-axis ticks for bars, row names for the table, e.g. 'hourly.time' or 'items[*].name'. Empty = positional indices.",
      ),
    display: z
      .enum(["stat", "line", "bars", "table"])
      .default("stat")
      .describe(
        "How to render: stat = big headline number (last value) with sparkline history; line = the series as a line chart; bars = labelled bar chart; table = label → value rows.",
      ),
    label: z
      .string()
      .max(80)
      .default("")
      .describe(
        'Caption naming the metric, e.g. "Bangkok Temp (°C)". Empty shows only the API hostname.',
      ),
    unit: z
      .string()
      .max(12)
      .default("")
      .describe(
        'Unit suffix appended to numeric values, e.g. "°C", "%", "km".',
      ),
    refreshMinutes: z
      .number()
      .int()
      .min(1)
      .max(1440)
      .default(15)
      .describe(
        "Re-fetch interval in minutes. Be polite to free APIs — 15+ unless the data genuinely moves faster.",
      ),
  }),
});
