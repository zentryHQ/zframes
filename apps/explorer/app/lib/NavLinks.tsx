"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS } from "@/app/lib/nav-links";

// Primary nav with an active-route highlight. Client-only for usePathname; the
// surrounding header shell stays in the (server) layout.
export function NavLinks() {
  const pathname = usePathname();
  return (
    // Hidden below sm — the same links are in MobileNav's hamburger there. This
    // row used to wrap onto a second header line on phones instead, which is
    // what the hamburger replaced (2026-08-29).
    <div className="hidden items-center gap-1 sm:flex">
      {NAV_LINKS.map((l) => {
        const active =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              active
                ? "bg-white/[0.06] text-white"
                : "text-white/55 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
