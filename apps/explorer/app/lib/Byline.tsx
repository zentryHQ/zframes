"use client";

import { useState } from "react";
import type { BoardAuthor } from "@/app/lib/board-summary";
import { HOUSE_USER } from "@/app/lib/house-account";
import { cn } from "@/app/lib/utils";

/**
 * "avatar · name" — who published a board, under its title on a gallery card.
 *
 * A client component for exactly one reason: `onError`. A provider avatar URL is
 * rotated and expired by Google long after the session row stored it, and the
 * fallback for that is not a broken-image glyph in a grid of 48 cards. Same
 * trade AuthNav makes for the header avatar, and the same plain `<img>`: a
 * remote host would need allowlisting in `next.config`'s `remotePatterns`, and a
 * 20px avatar has nothing to gain from the optimizer.
 */
export function Byline({
  author,
  className,
}: {
  author: BoardAuthor | null;
  className?: string;
}) {
  const [imageBroken, setImageBroken] = useState(false);

  // `null` should not happen: every listed board has an owner since 2026-08-28
  // (the house boards included). It stays handled because the one window where
  // it can — a release live before drizzle/0005 back-filled the curated rows —
  // is exactly the moment a card would otherwise render a byline-shaped hole.
  const a: BoardAuthor = author ?? HOUSE_USER;
  // `user.name` is notNull but not non-empty, and Google has handed over blank
  // ones. There is no second field to fall back to: `email` is the only other
  // identifier and it is private, which is the whole reason it is not in
  // BoardAuthor.
  const name = a.name.trim() || "Anonymous";

  return (
    <span
      className={cn("flex min-w-0 items-center gap-1.5 text-xs", className)}
    >
      <span className="grid size-4 shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-white/[0.06]">
        {a.image && !imageBroken ? (
          // no-referrer keeps this site's URL out of the request to the avatar's
          // provider — one row per card, so it would otherwise announce every
          // gallery view to Google's CDN.
          <img
            src={a.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageBroken(true)}
            className="size-full object-cover"
          />
        ) : (
          <span className="text-[8px] font-semibold text-white/70">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      <span className="truncate text-white/50">{name}</span>
    </span>
  );
}
