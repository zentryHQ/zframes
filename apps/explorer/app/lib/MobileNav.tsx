"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, XIcon } from "lucide-react";
import { authClient } from "@/app/lib/auth-client";
import { NAV_LINKS } from "@/app/lib/nav-links";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";

// The phone-width primary nav (2026-08-29). Below sm the header used to keep the
// same three links and wrap them onto a SECOND row (NavLinks was order-last
// w-full inside a flex-wrap nav), which cost 38px of a phone viewport on every
// page and made the fixed header two-thirds the height of the hero it sat on.
// Same links, one trigger, one row.
//
// modal={false} for the same reason AuthNav's menu sets it: the modal default
// locks body scroll, which removes the scrollbar and jogs every fixed element
// sideways by its width. Outside-click and Escape still dismiss.
export function MobileNav() {
  const pathname = usePathname();
  // "My dashboards" is a nav link, not an account action — on desktop it sits in
  // the header row next to the avatar, so on mobile it belongs in this menu
  // rather than in the avatar dropdown (which keeps only identity + sign out).
  const { data } = authClient.useSession();
  const signedIn = Boolean(data?.user);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : (pathname?.startsWith(href) ?? false);

  const itemClass = (href: string) =>
    `cursor-pointer px-3 py-2.5 text-sm ${
      isActive(href) ? "bg-white/[0.06] text-white" : "text-white/70"
    }`;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label="Menu"
        className="zf-press group relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-white/85 outline-none transition-colors hover:border-white/30 hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-white/45 sm:hidden"
      >
        {/* Both glyphs are mounted and cross-faded off the trigger's own state,
            so the icon never pops between two mount cycles mid-animation. */}
        <MenuIcon className="size-4 transition-opacity group-data-[state=open]:opacity-0" />
        <XIcon className="absolute size-4 opacity-0 transition-opacity group-data-[state=open]:opacity-100" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-44 sm:hidden">
        {NAV_LINKS.map((l) => (
          <DropdownMenuItem key={l.href} asChild className={itemClass(l.href)}>
            <Link
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
            >
              {l.label}
            </Link>
          </DropdownMenuItem>
        ))}

        {signedIn && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className={itemClass("/mine")}>
              <Link
                href="/mine"
                aria-current={isActive("/mine") ? "page" : undefined}
              >
                My dashboards
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
