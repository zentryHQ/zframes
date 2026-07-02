import type { ReactNode } from "react";
import Link from "next/link";
import { AuthNav } from "@/app/lib/AuthNav";
import { BrandMark } from "@/app/lib/BrandMark";
import { Footer } from "@/app/lib/Footer";
import { NavLinks } from "@/app/lib/NavLinks";
import { UnicornBackground } from "@/app/lib/UnicornBackground";
import "./globals.css";

export const metadata = {
  title: "zframes — describe your dashboard, an agent builds it",
  description:
    "AI agents generate personal market terminals. Install a skill into your coding agent, describe the dashboard you want, and it writes a live, keyless dashboard.json — stocks first, yours to own.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        {/* The living Aurora canvas — the same scene a generated dashboard renders
            on — fixed behind every page. Degrades to the body gradient on
            reduced-motion / low-end / load failure. */}
        <UnicornBackground />

        <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#07070c]/70 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-3 text-sm">
            <Link href="/" className="group flex items-center gap-2.5">
              <BrandMark
                idKey="hdr"
                className="h-7 w-7 transition-transform duration-300 group-hover:scale-105"
              />
              <span className="text-[15px] font-semibold tracking-tight text-white">zframes</span>
            </Link>

            <div className="ml-2 hidden h-5 w-px bg-white/10 sm:block" />
            <NavLinks />

            <div className="ml-auto flex items-center gap-3">
              <AuthNav />
            </div>
          </nav>
        </header>

        <div className="flex-1">{children}</div>

        <Footer />
      </body>
    </html>
  );
}
