import {
  absoluteUrl,
  INSTALL_COMMAND,
  LICENSE_URL,
  NPM_URL,
  ORG_NAME,
  REPO_URL,
  SITE_DESCRIPTION,
  SITE_LONG_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "@/app/lib/site";

/**
 * JSON-LD emitters + the one component that renders them.
 *
 * All of this is server-rendered into the initial HTML on purpose. Structured
 * data injected after hydration is read by Google (which renders JS) and missed
 * by most answer-engine crawlers (which largely do not), and the answer engines
 * are the audience that benefits most from it — so it has to be in the document
 * a plain `curl` returns.
 */

/**
 * Renders one JSON-LD graph.
 *
 * `JSON.stringify` output goes into a script tag, so `<` has to be escaped or a
 * `</script>` inside any string (a board title, a frame description) would close
 * the tag early and spill the rest of the payload into the document as markup.
 * `dangerouslySetInnerHTML` is the only way to emit script contents in React —
 * the escaping below is what makes it safe, and the reason we never interpolate
 * these strings raw.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

/** Stable `@id`s so the separate graphs below reference one another. */
export const ORG_ID = `${SITE_URL}/#organization`;
export const SITE_ID = `${SITE_URL}/#website`;
export const APP_ID = `${SITE_URL}/#software`;

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: ORG_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/icon.svg"),
    sameAs: [REPO_URL, NPM_URL],
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: "en",
    publisher: { "@id": ORG_ID },
  };
}

/**
 * The product itself. `SoftwareApplication` rather than `WebApplication`: what
 * a visitor installs and runs is a CLI on their own machine, and this site is
 * the shop window for it, not the application.
 *
 * `offers` with `price: "0"` is the field that makes "is it free?" answerable
 * from the markup alone — the single most common question about a developer
 * tool, and one an answer engine will otherwise hedge on.
 */
export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: SITE_NAME,
    description: SITE_LONG_DESCRIPTION,
    url: SITE_URL,
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "Market data dashboard",
    operatingSystem: "macOS, Linux, Windows",
    softwareRequirements: "Node.js, an AI coding agent",
    installUrl: NPM_URL,
    downloadUrl: NPM_URL,
    codeRepository: REPO_URL,
    license: LICENSE_URL,
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    // The version the site advertises, inlined at build time by next.config.ts.
    ...(process.env.ZFRAMES_CLI_VERSION
      ? { softwareVersion: process.env.ZFRAMES_CLI_VERSION }
      : {}),
  };
}

/**
 * `HowTo` for the three-step install. This is the shape answer engines reach for
 * when someone asks "how do I set up X", and it mirrors the visible Act IV steps
 * on the landing page rather than inventing a procedure of its own.
 */
export function howToJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `How to build a ${SITE_NAME} market dashboard`,
    description: `Install the ${SITE_NAME} skill into your AI coding agent, describe the dashboard you want, and own the generated dashboard.json.`,
    totalTime: "PT5M",
    estimatedCost: { "@type": "MonetaryAmount", currency: "USD", value: "0" },
    tool: [{ "@type": "HowToTool", name: "An AI coding agent" }],
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Install the skill",
        text: `Run \`${INSTALL_COMMAND}\` to teach your coding agent — Claude Code, Cursor, Codex or Gemini — how to build ${SITE_NAME} terminals.`,
        url: absoluteUrl("/#build"),
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Describe what you watch",
        text: "Tell the agent what you want on the board in plain language. It reads the frame catalogue and writes the dashboard spec for you.",
        url: absoluteUrl("/#build"),
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Own the result",
        text: "You get one git-trackable dashboard.json, served locally with live keyless data and editable in the browser.",
        url: absoluteUrl("/#build"),
      },
    ],
  };
}

/**
 * Breadcrumbs for a nested page. Google renders these into the result's URL
 * line, which is the cheapest legibility win on the page.
 */
export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}
