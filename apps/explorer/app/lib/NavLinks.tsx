"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/gallery", label: "Gallery" },
  { href: "/catalogue", label: "Catalogue" },
  { href: "/tinker", label: "Tinker" },
];

// Primary nav with an active-route highlight. Client-only for usePathname; the
// surrounding header shell stays in the (server) layout.
export function NavLinks() {
  const pathname = usePathname();
  return (
    // order-last + w-full wraps the links onto their own header row below sm
    // (the header nav is flex-wrap) — hiding them left phones with no nav.
    <div className="order-last -mx-3 flex w-full items-center gap-1 sm:order-none sm:mx-0 sm:w-auto">
      {LINKS.map((l) => {
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
