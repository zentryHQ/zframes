import Link from "next/link";
import { BrandMark } from "@/app/lib/BrandMark";

// Site footer — brand, one-line pitch, and the primary routes. Server-safe.
export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-white/10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <BrandMark idKey="ftr" className="h-6 w-6" />
            <span className="font-semibold tracking-tight text-white">zframes</span>
          </div>
          <p className="mt-3 text-sm text-white/60">
            Describe your dashboard. An agent builds it. It gets sharper every day —
            keyless market terminals, stocks first, yours to own.
          </p>
        </div>

        <nav className="grid grid-cols-2 gap-x-14 gap-y-2 text-sm">
          <span className="col-span-2 mb-1 text-xs font-medium uppercase tracking-widest text-white/45">
            Explore
          </span>
          <Link href="/" className="text-white/65 transition-colors hover:text-white">
            Gallery
          </Link>
          <Link href="/catalogue" className="text-white/65 transition-colors hover:text-white">
            Catalogue
          </Link>
          <Link href="/tinker" className="text-white/65 transition-colors hover:text-white">
            Tinker
          </Link>
          <Link href="/mine" className="text-white/65 transition-colors hover:text-white">
            My dashboards
          </Link>
        </nav>
      </div>
      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-5 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} zframes</span>
          <span className="font-mono">stocks · crypto · macro — keyless, live</span>
        </div>
      </div>
    </footer>
  );
}
