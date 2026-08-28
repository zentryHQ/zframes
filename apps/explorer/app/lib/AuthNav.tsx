"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/app/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";

// Header auth widget — rendered inside the (server) layout nav.
//
// Deliberately NO persistent "Sign in" CTA: an account is the price of writing
// (publish, My dashboards), never of using the product, so the prompt surfaces
// in-context at those gated moments (PublishDialog, /mine) instead of nagging
// from the chrome. Logged-out (and while the session resolves) this renders
// nothing.
//
// Signed in this is TWO things, not one: "My dashboards" as a plain nav link,
// and the avatar as the account menu. The link used to be buried a click deep
// inside the dropdown — the one route a signed-in author actually returns to,
// hidden behind a control that looks like account settings. Navigation belongs
// in the nav; the menu keeps only what is genuinely account-level (who you are,
// and signing out).

/** First letter of the name, else of the email — the fallback when there is no
 *  avatar image, or when the provider's CDN fails to serve one. */
function initialOf(user: { name?: string | null; email: string }): string {
  const source = user.name?.trim() || user.email;
  return source.charAt(0).toUpperCase();
}

export function AuthNav() {
  const { data, isPending } = authClient.useSession();
  const pathname = usePathname();
  // A Google avatar URL can 404 (rotated/expired) long after the session row
  // stored it, which would leave a broken-image glyph in the header forever.
  const [imageBroken, setImageBroken] = useState(false);

  if (isPending || !data?.user) return null;
  const user = data.user;
  const onMine = pathname?.startsWith("/mine") ?? false;

  return (
    <>
      {/* Same shape as NavLinks' items, active state included: it reads as one
          nav row with Boards / Frames / Editor, just anchored on the right. */}
      <Link
        href="/mine"
        aria-current={onMine ? "page" : undefined}
        className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
          onMine
            ? "bg-white/[0.06] text-white"
            : "text-white/55 hover:bg-white/[0.04] hover:text-white"
        }`}
      >
        My dashboards
      </Link>

      {/* modal={false} is load-bearing, not a preference. The modal default
          locks body scroll while the menu is open, which removes the page
          scrollbar and widens every fixed element (this header included) by its
          width — a visible sideways jolt of the whole page on a menu that
          neither needs nor wants a scroll lock. Non-modal keeps the page
          exactly as wide as it was; outside-click and Escape still dismiss. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          aria-label={`Account: ${user.email}`}
          className="size-8 shrink-0 cursor-pointer overflow-hidden rounded-full border border-white/15 bg-white/[0.06] outline-none transition-colors hover:border-white/35 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-white/45"
        >
          {user.image && !imageBroken ? (
            // Plain <img>, not next/image: a Google CDN host would have to be
            // allowlisted in next.config's remotePatterns, and a 32px avatar has
            // nothing to gain from the optimizer. no-referrer keeps the site's
            // URL out of the request to the provider.
            <img
              src={user.image}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setImageBroken(true)}
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-xs font-semibold text-white/80">
              {initialOf(user)}
            </span>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="min-w-52">
          {/* The email is now the menu's only identity cue — the trigger stopped
              spelling it out when it became an avatar, so it has to live here. */}
          <DropdownMenuLabel className="truncate font-normal text-white/60">
            {user.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              authClient.signOut().then(() => window.location.reload())
            }
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
