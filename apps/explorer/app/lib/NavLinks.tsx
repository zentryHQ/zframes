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
    <div className="hidden items-center gap-1 sm:flex">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
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
