import { INSTALL_COMMAND, REPO_URL, SITE_NAME } from "@/app/lib/site";

/**
 * The site's canonical questions and answers — ONE list, rendered three ways:
 * as the visible FAQ on the landing page, as `FAQPage` structured data, and as
 * the Q&A block in `/llms.txt`.
 *
 * Why one list matters more here than it usually does: Google's structured-data
 * policy requires FAQ markup to mirror content that is actually visible on the
 * page, and an answer engine that quotes an answer we never showed a human is a
 * worse failure than not being quoted at all. Deriving all three from this array
 * makes the visible copy and the machine-readable copy the same words by
 * construction, rather than by whoever remembers to update the second one.
 *
 * Answers are written to be **extractable**: each one opens with a
 * self-contained sentence that answers the question without needing the question
 * as context, because that sentence is what gets lifted into an AI summary or a
 * featured snippet. "Yes. zframes is free and open source under MIT."
 * survives being quoted alone; "It is, under MIT" does not.
 */
export type FaqItem = { question: string; answer: string };

export const FAQ: FaqItem[] = [
  {
    question: `What is ${SITE_NAME}?`,
    answer: `${SITE_NAME} is a free, open-source framework for AI-generated market dashboards. You install a skill into your AI coding agent, describe what you want to watch in plain language, and the agent writes a dashboard.json spec that the ${SITE_NAME} CLI renders as a live terminal covering stocks, crypto, macro, metals and housing.`,
  },
  {
    question: `Is ${SITE_NAME} free?`,
    answer: `Yes. ${SITE_NAME} is free and open source under the MIT licence — the framework, the CLI and all of the frames. There is no paid tier, no account and nothing withheld behind one. The source is at ${REPO_URL}.`,
  },
  {
    question: "Do I need an API key to use it?",
    answer: `No. Every default data source is keyless — free public APIs including Hyperliquid, CoinGecko, DeFiLlama, the Federal Reserve's FRED, the U.S. Treasury, SEC EDGAR, the LBMA, Zillow and the FHFA. You can preview and run a dashboard without signing up for anything or creating a .env file. Connecting a private account (for example a Binance portfolio) is a separate opt-in tier.`,
  },
  {
    question: `Which AI agents can build a ${SITE_NAME} dashboard?`,
    answer: `Any skills-aware coding agent — Claude Code, Cursor, Codex and Gemini among them. The skills are plain Markdown following the open skills standard, so install is the same everywhere: run \`${INSTALL_COMMAND}\`. Only how you summon the skill differs between agents.`,
  },
  {
    question: `How do I install ${SITE_NAME}?`,
    answer: `Run \`${INSTALL_COMMAND}\` to install the skill into your coding agent, then ask it for the dashboard you want — for example "/zframes build me a TSLA and NVDA terminal with funding rates and fear & greed". The agent writes the spec and serves it with \`npx zframes serve\`. There is no repository to clone and no build step.`,
  },
  {
    question: "Where does my dashboard actually live?",
    answer: `Your dashboard is a single git-trackable dashboard.json file on your own machine. The ${SITE_NAME} CLI serves it locally over 127.0.0.1 with live data, and you can edit it in the browser and save back to the file. It is not a hosted service, so there is nothing to log in to and no data to lock in.`,
  },
  {
    question: "Does my market data leave my machine?",
    answer: `No. The CLI serves your dashboard from your own machine and fetches market data straight from the public providers. ${SITE_NAME} runs no backend of its own for your board, and the dashboard.json never leaves your disk unless you deliberately publish it to the public gallery.`,
  },
  {
    question: "What can the dashboards show?",
    answer: `Live prices and charts for stocks and crypto, company fundamentals and SEC filings, U.S. macro and rate data, precious metals and commodities, Bitcoin network health, on-chain and DeFi metrics, options chains, FX, housing indices, news and sentiment. Boards are composed from a catalogue of individual frames, and any dashboard can be displayed in any of 146 currencies.`,
  },
  {
    question: `Can I share or fork a ${SITE_NAME} dashboard?`,
    answer: `Yes. Publishing a board to the gallery gives you a shareable link, and anyone can hand that link to their own agent to fork the board onto their machine, where it becomes their own dashboard.json to edit. Boards can also be published unlisted, reachable only by link.`,
  },
  {
    question: `Do I need to know React to build a ${SITE_NAME} dashboard?`,
    answer: `No. The agent only ever emits JSON — the framework owns all rendering, so neither you nor the agent writes a line of React. Invalid configuration renders as a per-frame error card instead of breaking the dashboard, which is what lets the agent correct itself.`,
  },
];

/** `FAQPage` structured data derived from the list above. */
export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
