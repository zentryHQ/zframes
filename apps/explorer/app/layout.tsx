import type { ReactNode } from "react";
import Link from "next/link";
import { AuthNav } from "@/app/lib/AuthNav";
import "./globals.css";

export const metadata = {
  title: "zframes — explore market dashboards",
  description:
    "Browse a live catalogue of market frames and curated dashboards. Preview any board with real data, then run it on your machine.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07070c]/80 backdrop-blur">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3 text-sm">
            <Link href="/" className="font-semibold tracking-tight text-white">
              zframes<span className="text-indigo-400">.explorer</span>
            </Link>
            <div className="flex items-center gap-4 text-white/60">
              <Link href="/" className="transition-colors hover:text-white">
                Gallery
              </Link>
              <Link href="/catalogue" className="transition-colors hover:text-white">
                Catalogue
              </Link>
              <Link href="/tinker" className="transition-colors hover:text-white">
                Tinker
              </Link>
            </div>
            <div className="ml-auto">
              <AuthNav />
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
