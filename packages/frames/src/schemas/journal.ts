import { defineFrameMeta } from "@zframes/spec/frame";
import { z } from "zod";
import { widgetIcon, SOURCES } from "./shared";

// The decision-journal frames are a FAMILY sharing one journal: Log captures a
// read, Open tracks the live calls, Results shows them graded, Scoreboard reads
// the aggregate. Split apart (not one mega-frame) so each does one calm job and
// the user composes the ones they want. (Scaffold: backed by a shared in-memory
// mock store; production round-trips a journal.json like the daily brief.)
export const journalLogMeta = defineFrameMeta({
  name: "journal-log",
  label: "Journal · Log",
  category: "journal",
  iconUrl: widgetIcon("journal-log"),
  layout: { w: 4, h: 5, minW: 3, minH: 3 },
  source: SOURCES.hyperliquid,
  description:
    "Log a market read in seconds: pick a supported ticker (with its live Hyperliquid price), Long or Short, the reason (a quick pick + optional note), and how sure you are (a slider). That's it — a falsifiable call, captured at the live price, that the Open/Results frames then track and grade. The simple front door to your decision journal; pairs with the zAI orb for conversational capture. Add one alongside Journal · Open and Journal · Results.",
  capabilities: ["quote-stream", "day-stats"],
  schema: z.object({}),
});

export const journalOpenMeta = defineFrameMeta({
  name: "journal-open",
  label: "Journal · Open",
  category: "journal",
  iconUrl: widgetIcon("journal-open"),
  layout: { w: 4, h: 4, minW: 2, minH: 1 },
  description:
    "Your open calls from the decision journal, each marking to the live Hyperliquid price — direction, confidence, unrealized % return, a live entry→target track, and a countdown. Calls auto-grade at their horizon (or close one early). The 'watch it play out' frame. Reads the journal you write with Journal · Log.",
  source: SOURCES.hyperliquid,
  capabilities: ["quote-stream"],
  schema: z.object({
    max: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(8)
      .describe("How many open calls to show (newest first)."),
  }),
});

export const journalResultsMeta = defineFrameMeta({
  name: "journal-results",
  label: "Journal · Results",
  category: "journal",
  iconUrl: widgetIcon("journal-results"),
  layout: { w: 4, h: 4, minW: 2, minH: 3, maxH: 7 },
  description:
    "Your resolved calls from the decision journal, graded on TWO axes: did it hit, AND did the thesis actually play out — so a lucky hit reads differently from earned skill, and a near-miss from a clean miss. The reflection frame. Reads the journal you write with Journal · Log.",
  capabilities: [],
  schema: z.object({
    max: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(8)
      .describe("How many resolved calls to show (newest first)."),
  }),
});

export const journalScoreMeta = defineFrameMeta({
  name: "journal-score",
  label: "Journal · Scoreboard",
  category: "journal",
  iconUrl: widgetIcon("journal-score"),
  layout: { w: 4, h: 3, minW: 3, minH: 2, maxH: 3 },
  description:
    "The decision-journal scoreboard — a story, not a spreadsheet: where your judgment has an edge, where it leaks, and how calibrated your confidence is, plus a one-line read from zAI. Aggregates the calls logged via Journal · Log.",
  capabilities: [],
  schema: z.object({}),
});
