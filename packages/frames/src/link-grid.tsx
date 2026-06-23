import { defineFrame } from "@zframes/core";
import { useState } from "react";
import type { z } from "zod";
import { interactiveSurface } from "./content-shared";
import { linkGridMeta } from "./schemas";
import { scrollAreaClass } from "./ui";

const schema = linkGridMeta.schema;
type Config = z.output<typeof schema>;
type Link = Config["links"][number];

const isImageUrl = (s: string) => /^https?:\/\//i.test(s);

/** Hostname from a URL, tolerating a missing scheme ("tradingview.com"). */
function hostOf(url: string): string | null {
  for (const candidate of [url, `https://${url}`]) {
    try {
      const h = new URL(candidate).hostname;
      if (h) return h;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * Keyless favicon for a site, sized for a retina tile. Same spirit as the
 * project's CDN asset logos — a public, no-key endpoint, loaded as a plain
 * <img> (no CORS), with a first-letter fallback if it fails to load.
 */
function faviconUrl(url: string): string | null {
  const host = hostOf(url);
  return host
    ? `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`
    : null;
}

function Tile({ link }: { link: Link }) {
  const [imgFailed, setImgFailed] = useState(false);

  const icon = link.icon.trim();
  const explicitImg = icon && isImageUrl(icon) ? icon : null;
  const emoji = icon && !explicitImg ? icon : null;
  const imgSrc = explicitImg ?? (emoji ? null : faviconUrl(link.url));
  const showImg = imgSrc != null && !imgFailed;

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={link.url}
      className={`group flex items-center gap-2 px-2.5 py-2 ${interactiveSurface}`}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/[0.06] text-base leading-none"
        aria-hidden
      >
        {emoji ? (
          <span>{emoji}</span>
        ) : showImg ? (
          <img
            src={imgSrc!}
            alt=""
            className="h-full w-full object-contain"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="text-soft font-dmsans font-bold uppercase">
            {link.label.charAt(0)}
          </span>
        )}
      </span>
      <span className="body-sm text-normal min-w-0 flex-1 truncate font-medium group-hover:text-strong">
        {link.label}
      </span>
    </a>
  );
}

function LinkGrid({ config }: { config: Config }) {
  return (
    <div className={scrollAreaClass}>
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))`,
        }}
      >
        {config.links.map((link, i) => (
          <Tile key={`${link.url}-${i}`} link={link} />
        ))}
      </div>
    </div>
  );
}

export const linkGridFrame = defineFrame({
  ...linkGridMeta,
  component: LinkGrid,
});
