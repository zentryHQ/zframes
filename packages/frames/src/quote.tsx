import { defineFrame } from "@zframes/core";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { quoteMeta } from "./schemas";
import { useReducedMotion } from "./use-reduced-motion";

const schema = quoteMeta.schema;
type Config = z.output<typeof schema>;

const accent = "var(--color-highlight)";

function Quote({ config }: { config: Config }) {
  const quotes = config.quotes;
  const [idx, setIdx] = useState(0);
  // Under reduced motion the card holds the quote it is showing. Same reasoning
  // as the gallery's: `intervalSec: 0` is already the frame's supported static
  // mode, and text replacing itself on a timer is movement nobody asked for.
  // The dots below stay, so it still reads as one of several.
  const reduced = useReducedMotion();

  // Restart from the top whenever the quote list changes (config-rail edit).
  useEffect(() => setIdx(0), [config.quotes]);

  useEffect(() => {
    if (reduced || config.intervalSec <= 0 || quotes.length <= 1) return;
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % quotes.length),
      config.intervalSec * 1000,
    );
    return () => window.clearInterval(id);
  }, [config.intervalSec, quotes.length, reduced]);

  const text = quotes[Math.min(idx, quotes.length - 1)] ?? "";

  return (
    <div className="flex h-full w-full items-center justify-center [container-type:size]">
      <figure className="relative max-h-full overflow-auto px-3 text-center">
        <span
          aria-hidden
          className="block font-dmsans font-black leading-none"
          style={{ fontSize: "clamp(1.5rem, 14cqmin, 3rem)", color: accent }}
        >
          “
        </span>
        <blockquote
          className="body-md text-normal -mt-[0.3em] whitespace-pre-wrap italic leading-snug"
          style={{ fontSize: "clamp(0.85rem, 8cqmin, 1.25rem)" }}
        >
          {text}
        </blockquote>
        {quotes.length > 1 && (
          <figcaption className="mt-2 flex justify-center gap-1.5" aria-hidden>
            {quotes.map((_, i) => (
              <span
                key={i}
                className="h-1 w-1 rounded-full transition-colors"
                style={{
                  background:
                    i === Math.min(idx, quotes.length - 1)
                      ? accent
                      : "var(--color-disabled)",
                }}
              />
            ))}
          </figcaption>
        )}
      </figure>
    </div>
  );
}

export const quoteFrame = defineFrame({
  ...quoteMeta,
  component: Quote,
});
