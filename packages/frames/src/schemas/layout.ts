import { defineFrameMeta } from "@zframes/spec/frame";
import { z } from "zod";
import { widgetIcon } from "./shared";

export const noteMeta = defineFrameMeta({
  name: "note",
  label: "Note",
  category: "layout",
  iconUrl: widgetIcon("note"),
  layout: { w: 4, h: 3, minW: 1, minH: 1, maxH: 4 },
  description:
    "Free-form text note pinned to the dashboard — trading plans, reminders, watch levels. Renders a safe Markdown subset: **bold**, *italic*, `inline code`, [links](https://…), #/##/### headings, and - / 1. lists. Plain text still renders as written. Needs no data provider.",
  capabilities: [],
  chrome: "plain",
  schema: z.object({
    text: z
      .string()
      .min(1)
      .describe(
        "The note's text content. Renders a safe Markdown subset — **bold**, *italic*, `code`, [text](https://url), #/##/### headings, and unordered (-) / ordered (1.) lists (raw HTML is never executed). Blank lines start new paragraphs; single newlines become line breaks. Plain text works too.",
      ),
    align: z
      .enum(["left", "center"])
      .default("left")
      .describe("Text alignment inside the card."),
  }),
});

export const imageMeta = defineFrameMeta({
  name: "image",
  label: "Image",
  category: "layout",
  iconUrl: widgetIcon("image"),
  layout: { w: 3, h: 3, minW: 1, minH: 1 },
  description:
    "Displays an image from a URL — logos, memes, chart screenshots, banners. Needs no data provider.",
  capabilities: [],
  chrome: "plain",
  schema: z.object({
    url: z.string().min(1).describe("Image URL (https)."),
    alt: z.string().default("").describe("Alt text for accessibility."),
    fit: z
      .enum(["cover", "contain"])
      .default("cover")
      .describe(
        "How the image fills the frame: cover crops, contain letterboxes.",
      ),
  }),
});

export const heroNumberMeta = defineFrameMeta({
  name: "hero-number",
  label: "Hero Number",
  category: "layout",
  iconUrl: widgetIcon("hero-number"),
  layout: { w: 3, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 2 },
  description:
    "A big manual KPI card you fill in yourself — one headline number, a caption, and an optional signed change. Static text, not a live feed: use it to pin a figure that has no provider (a target, a personal goal, a fact from elsewhere), e.g. '$39.6T' national debt or '127 EH/s' hashrate. Needs no data provider.",
  capabilities: [],
  chrome: "plain",
  schema: z.object({
    value: z
      .string()
      .min(1)
      .describe(
        'The headline figure, shown large. Free text so you can include units/symbols, e.g. "$39.6T", "127 EH/s", "4.25%".',
      ),
    label: z
      .string()
      .default("")
      .describe(
        'Caption naming what the number is, e.g. "US National Debt". Empty hides it.',
      ),
    delta: z
      .string()
      .default("")
      .describe(
        'Optional change chip shown under the number, e.g. "+1.5%" or "-3 blocks". Empty hides it.',
      ),
    deltaDir: z
      .enum(["up", "down", "neutral"])
      .default("neutral")
      .describe(
        "Tint for the delta chip: up = gain color, down = loss color, neutral = muted. Purely cosmetic — it does not parse the delta text.",
      ),
    sublabel: z
      .string()
      .default("")
      .describe(
        'Optional small line under the delta for context, e.g. "as of Jul 2026". Empty hides it.',
      ),
  }),
});

export const imageGalleryMeta = defineFrameMeta({
  name: "image-gallery",
  label: "Image Gallery",
  category: "layout",
  iconUrl: widgetIcon("image-gallery"),
  layout: { w: 4, h: 3, minW: 2, minH: 1 },
  description:
    "A rotating gallery that cross-fades through a list of images on a timer — chart screenshots, memes, banners, a mood board. Needs no data provider.",
  capabilities: [],
  chrome: "plain",
  schema: z.object({
    images: z
      .array(
        z.object({
          url: z.string().min(1).describe("Image URL (https)."),
          alt: z.string().default("").describe("Alt text for accessibility."),
        }),
      )
      .min(1)
      .describe("The images to rotate through, in order. At least one."),
    intervalSec: z
      .number()
      .int()
      .min(0)
      .default(6)
      .describe(
        "Seconds between cross-fades when there is more than one image. 0 shows the first image, fixed.",
      ),
    fit: z
      .enum(["cover", "contain"])
      .default("cover")
      .describe(
        "How each image fills the frame: cover crops to fill, contain letterboxes.",
      ),
  }),
});

export const groupMeta = defineFrameMeta({
  name: "group",
  label: "Group",
  category: "layout",
  // No iconUrl yet — the palette renders the card text-only rather than a broken
  // <img>; drop a `group.png` into the runtime's widget-icons and add
  // `iconUrl: widgetIcon("group")` when one exists.
  layout: { w: 6, h: 4, minW: 1, minH: 1, maxH: 5 },
  description:
    "A container that holds OTHER frames as its own little grid, so a cluster of related cards occupies one board slot and moves/resizes as a single unit. Use it to build a composite panel — a 2x2 of sparklines, a chart with its own stat strip beneath, a side-by-side split — that stays together when the board is rearranged. The nested frames go in the instance's `children` array (not in `config`), each with a `position` in this group's own `columns` x `rows` units. Groups cannot contain other groups. Needs no data provider of its own; each child declares its own.",
  capabilities: [],
  // No card and no auto-title of its own: the children carry the titles, while
  // the group's surrounding surface comes from `panel` (on by default).
  chrome: "bare",
  container: true,
  schema: z.object({
    columns: z
      .number()
      .int()
      .min(1)
      .max(12)
      .default(2)
      .describe(
        "How many columns the group's INNER grid is divided into (1-12). A child's position x/w are in these units — so with columns: 2, a child at x: 0, w: 1 fills the left half. Keep it small: a group is a cluster, not a second dashboard.",
      ),
    rows: z
      .number()
      .int()
      .min(1)
      .max(12)
      .default(2)
      .describe(
        "How many rows the group's INNER grid is divided into (1-12). Unlike the board's rows these are FRACTIONS of the group's own height, so the cluster always fills the slot exactly — a child's position y/h are in these units.",
      ),
    gap: z
      .number()
      .min(0)
      .max(48)
      .default(8)
      .describe(
        "Pixels between the child frames. Defaults tighter than the board gutter so a group reads as one object; 0 makes the children flush.",
      ),
    panel: z
      .boolean()
      .default(true)
      .describe(
        "Draw a surrounding surface (tinted panel + border) around the whole group. On by default — a group is one composite object and the surface is what says so; without it a cluster reads as loose cards that happen to sit near each other. Set it to false for a group used purely as invisible scaffolding, where the children's own cards should be the only surfaces.",
      ),
  }),
});

export const headingMeta = defineFrameMeta({
  name: "heading",
  label: "Heading",
  category: "layout",
  iconUrl: widgetIcon("heading"),
  layout: { w: 12, h: 1, minW: 1, minH: 1, maxH: 1 },
  description:
    "Section divider that titles a region of the dashboard ('Markets', 'On-chain', 'Desk'). Renders as a label with a hairline rule — no card. Use to group frames into zones: place full-width (w: 12) and 1 row tall (h: 1) above each group. Needs no data provider.",
  capabilities: [],
  chrome: "bare",
  schema: z.object({
    title: z.string().min(1).describe("The heading text."),
    subtitle: z
      .string()
      .optional()
      .describe("Smaller supporting line under the title."),
    accent: z
      .number()
      .min(0)
      .max(360)
      .optional()
      .describe(
        "Optional hue (0–360) that tints the marker dot, the rule, and the title. Omit to use the dashboard's own accent (the default look).",
      ),
    align: z
      .enum(["left", "center"])
      .default("left")
      .describe(
        "Left aligns the label with a trailing rule (default); center places the label between rules on both sides.",
      ),
  }),
});

export const videoMeta = defineFrameMeta({
  name: "video",
  label: "Video",
  category: "layout",
  iconUrl: widgetIcon("video"),
  layout: { w: 4, h: 3, minW: 1, minH: 1 },
  description:
    "Embeds a video from a YouTube or Vimeo link (or any direct embed URL) as an iframe — a livestream, a market-news clip, a focus playlist. Needs no data provider.",
  capabilities: [],
  chrome: "plain",
  schema: z.object({
    url: z
      .string()
      .min(1)
      .describe(
        "Video URL — a YouTube watch/share link, a Vimeo link, or a direct embeddable URL (https).",
      ),
    title: z
      .string()
      .default("Video")
      .describe("Accessible title for the embedded player (iframe title)."),
  }),
});

export const drawdyMeta = defineFrameMeta({
  name: "drawdy",
  label: "Drawdy",
  category: "layout",
  iconUrl: widgetIcon("drawdy"),
  layout: { w: 8, h: 6, minW: 1, minH: 2 },
  description:
    "Embeds drawdy.io as an interactive whiteboard canvas. No configuration needed.",
  capabilities: [],
  schema: z.object({}),
});

export const quoteMeta = defineFrameMeta({
  name: "quote",
  label: "Quote",
  category: "layout",
  iconUrl: widgetIcon("quote"),
  layout: { w: 4, h: 2, minW: 1, minH: 1, maxW: 11, maxH: 3 },
  description:
    'Displays a market or trading quote, centered — set one or rotate through several. A calm bit of wall-art for the dashboard: trading maxims, reminders of your own rules, mantras. Write any attribution into the text itself (e.g. "… — Buffett"). Needs no data provider.',
  capabilities: [],
  chrome: "plain",
  schema: z.object({
    quotes: z
      .array(z.string().min(1))
      .min(1)
      .default([
        "Be fearful when others are greedy, and greedy when others are fearful. — Warren Buffett",
        "The trend is your friend until the end when it bends.",
        "Plan the trade, trade the plan.",
      ])
      .describe(
        "One or more quotes. With more than one, the frame rotates through them.",
      ),
    intervalSec: z
      .number()
      .int()
      .min(0)
      .default(12)
      .describe(
        "Seconds between rotations when there are multiple quotes. 0 shows the first quote, fixed.",
      ),
  }),
});

export const dividerMeta = defineFrameMeta({
  name: "divider",
  label: "Divider",
  category: "layout",
  iconUrl: widgetIcon("divider"),
  layout: { w: 12, h: 1, minW: 1, minH: 1, maxH: 1 },
  description:
    "A plain rule that separates regions of the dashboard, with an optional centered label. Renders chrome-less (no card) — lighter than a heading. Use a horizontal divider full-width between stacked zones, or set orientation to vertical for a 1-column-wide column separator. Needs no data provider.",
  capabilities: [],
  chrome: "bare",
  schema: z.object({
    label: z
      .string()
      .default("")
      .describe(
        "Optional text shown in the middle of the rule. Empty = a clean line.",
      ),
    orientation: z
      .enum(["horizontal", "vertical"])
      .default("horizontal")
      .describe(
        "Horizontal rule (spans the width) or vertical rule (spans the height).",
      ),
    style: z
      .enum(["solid", "dashed", "dotted"])
      .default("solid")
      .describe("Line style."),
    accent: z
      .number()
      .min(0)
      .max(360)
      .optional()
      .describe(
        "Optional hue (0–360) that tints the rule and its label. Omit for the default subtle hairline.",
      ),
    thickness: z
      .number()
      .int()
      .min(1)
      .max(8)
      .default(1)
      .describe("Rule thickness in pixels. 1 is the default hairline."),
  }),
});

export const marqueeMeta = defineFrameMeta({
  name: "marquee",
  label: "Marquee",
  category: "layout",
  iconUrl: widgetIcon("marquee"),
  layout: { w: 6, h: 1, minW: 3, minH: 1, maxH: 1 },
  description:
    "A chrome-less scrolling banner that glides custom text continuously right-to-left across the frame (think stadium ticker / news crawl). Renders with no card — it fills the whole frame. Use for a slogan, a reminder, or a hype line. Needs no data provider.",
  capabilities: [],
  chrome: "bare",
  schema: z.object({
    text: z
      .string()
      .default("LFG")
      .describe("The text that scrolls across the banner."),
    speed: z
      .enum(["slow", "normal", "fast"])
      .default("normal")
      .describe("Scroll speed."),
    accent: z
      .boolean()
      .default(true)
      .describe("Tint the text with the dashboard accent color."),
  }),
});

export const rulesCardMeta = defineFrameMeta({
  name: "rules-card",
  label: "Rules",
  category: "layout",
  iconUrl: widgetIcon("rules-card"),
  layout: { w: 3, h: 3, minW: 2, minH: 2, maxH: 4 },
  description:
    "A pinned, auto-numbered list of your trading rules (or any principles) — always fully visible, unlike the rotating `quote` frame. Static text, client-side, no data provider.",
  capabilities: [],
  schema: z.object({
    title: z
      .string()
      .default("My rules")
      .describe("Heading shown above the list."),
    rules: z
      .array(z.string())
      .default([
        "Cut losers fast, let winners run",
        "No trade without a stop",
        "One setup at a time",
      ])
      .describe("The rules, in order; rendered as a numbered list."),
  }),
});

export const breathingMeta = defineFrameMeta({
  name: "breathing",
  label: "Breathing",
  category: "layout",
  iconUrl: widgetIcon("breathing"),
  chrome: "bare",
  layout: { w: 2, h: 2, minW: 1, minH: 1, maxH: 2 },
  description:
    "A chrome-less breathing pacer — a circle that expands and contracts through configurable inhale / hold / exhale / hold phases to steady your breathing between trades. Renders with no card; client-side only, no data provider.",
  capabilities: [],
  schema: z.object({
    inhale: z.number().min(1).max(60).default(4).describe("Inhale seconds."),
    hold: z
      .number()
      .min(0)
      .max(60)
      .default(4)
      .describe("Hold-after-inhale seconds."),
    exhale: z.number().min(1).max(60).default(4).describe("Exhale seconds."),
    holdAfter: z
      .number()
      .min(0)
      .max(60)
      .default(4)
      .describe("Hold-after-exhale seconds."),
  }),
});

export const spotifyEmbedMeta = defineFrameMeta({
  name: "spotify-embed",
  label: "Spotify",
  category: "layout",
  iconUrl: widgetIcon("spotify-embed"),
  layout: { w: 3, h: 4, minW: 1, minH: 1 },
  description:
    "Embeds a Spotify track, album, playlist, artist, or show from its public open.spotify.com share link (same embed approach as the `video` frame), using Spotify's official keyless iframe player. Needs an internet connection to play.",
  capabilities: [],
  schema: z.object({
    url: z
      .string()
      .default("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")
      .describe(
        "A Spotify share URL (open.spotify.com/track|album|playlist|artist/…).",
      ),
    compact: z
      .boolean()
      .default(false)
      .describe("Use Spotify's compact (single-row) player height."),
  }),
});
