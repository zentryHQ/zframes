"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Agentation } from "agentation";
import { Toaster } from "sonner";
import { AuthNav } from "@/app/lib/AuthNav";
import { BrandMark } from "@/app/lib/BrandMark";
import { Footer } from "@/app/lib/Footer";
import { MobileNav } from "@/app/lib/MobileNav";
import { NavLinks } from "@/app/lib/NavLinks";
import { UnicornBackground } from "@/app/lib/UnicornBackground";

// Site chrome wrapper. The chrome-less /embed/* routes — iframed live boards in
// the landing showcase — render BARE: no header, footer, Aurora canvas, toaster,
// or dev tools, so an embedded board is nothing but the board itself. Every other
// route gets the full terminal shell. Client only because it branches on the
// pathname; `children` are still server-rendered and slotted in as a prop, so page
// SSR/SEO is unaffected (usePathname resolves during SSR too — no hydration skew).
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const bare = pathname?.startsWith("/embed/") ?? false;
  // /dashboard/[id] and /editor render the BOARD's own declared background (its
  // unicorn scene / gradient / image, via DashboardBackground in
  // DashboardPreview / EditorView) — mounting the site Aurora underneath it
  // would run a second WebGL scene for nothing, so the chrome backdrop yields on
  // those routes.
  const boardBackdrop =
    (pathname?.startsWith("/dashboard/") ?? false) || pathname === "/editor";

  if (bare) return <>{children}</>;

  return (
    <>
      {/* The living Aurora canvas — the same scene a generated dashboard renders
          on — fixed behind every page. Degrades to the body gradient on
          reduced-motion / low-end / load failure. */}
      {!boardBackdrop && <UnicornBackground />}

      <div className="flex min-h-screen flex-col">
        {/* Fixed (not sticky) so the bar stays pinned to the viewport and never
            rubber-bands with the page on overscroll. Content is offset by the
            header height below. */}
        <header className="glass fixed inset-x-0 top-0 z-50 border-b border-white/[0.07]">
          {/* ONE row at every width. Below sm the three nav links collapse
              into MobileNav's hamburger rather than wrapping onto a second
              header row, so the offset below is a single constant. */}
          <nav className="mx-auto flex max-w-7xl items-center gap-x-4 px-4 py-3 text-sm sm:px-6">
            <Link href="/" className="group flex items-center gap-2.5">
              <BrandMark idKey="hdr" className="zf-grow h-7 w-7" />
              <span className="text-[15px] font-semibold tracking-tight text-white">
                zframes
              </span>
            </Link>

            <div className="ml-2 hidden h-5 w-px bg-white/10 sm:block" />
            <NavLinks />

            {/* Right slot: the auth controls, plus the hamburger on phones.
                The hamburger goes LAST — the auth control is the corner a person
                reaches for, and it should not move between breakpoints.
                (The GitHub link lives in the footer.) */}
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <AuthNav />
              <MobileNav />
            </div>
          </nav>
        </header>

        <div className="flex-1 pt-[57px]">{children}</div>

        <Footer />
      </div>

      {/* App-wide feedback. Glass-dark themed via globals.css [data-sonner-*]
          rules so success/error read in the dashboard's own up/down palette. */}
      <Toaster
        theme="dark"
        position="bottom-center"
        richColors
        closeButton
        toastOptions={{ className: "zf-toast" }}
      />

      {process.env.NODE_ENV === "development" && (
        <Agentation endpoint="http://localhost:4747" />
      )}
    </>
  );
}
