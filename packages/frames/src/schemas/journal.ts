import { defineFrameMeta } from "@zframes/spec/frame";
import { z } from "zod";
import { widgetIcon, SOURCES } from "./shared";

// The decision-journal frames are a FAMILY sharing one journal: Log captures a
// read, Open tracks the live calls, Results shows them graded, Scoreboard reads
// the aggregate. Split apart (not one mega-frame) so each does one calm job and
// the user composes the ones they want.
//
// The journal holds the user's own calls and nothing else — no seeded examples,
// no sample performance figures — and it lives in `localStorage` under one key
// shared by the family (`journal-store.ts` says why not the dashboard file).
// Every frame here shows an empty state until there is something real to read.
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
    "Your resolved calls from the decision journal: direction, confidence, the claim you made and the realized % return that graded it. The reflection frame. Where a mechanism grade exists for a call it reads on a second axis too — whether the thesis actually played out, so a lucky hit reads differently from earned skill — and the mechanical return grade alone does not set one. Reads the journal you write with Journal · Log; empty until a call resolves.",
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
    "The decision-journal scoreboard — a story, not a spreadsheet: where your judgment has an edge, where it leaks, how calibrated your confidence is, and a one-line read of the record. Every figure is computed from your own graded calls, so each reads 'no graded calls yet' until one resolves. Aggregates the calls logged via Journal · Log.",
  capabilities: [],
  schema: z.object({}),
});
