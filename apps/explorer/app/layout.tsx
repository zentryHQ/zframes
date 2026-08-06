import type { ReactNode } from "react";
import { AppShell } from "@/app/lib/AppShell";
import "./globals.css";

export const metadata = {
  title: "zframes — free, open-source market terminals your agent builds",
  description:
    "AI agents generate personal market terminals. Install a skill into your coding agent, describe the dashboard you want, and it writes a live, keyless dashboard.json — stocks and crypto, free and open source (Apache-2.0), yours to own.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* AppShell owns the chrome and hides it on /embed/* (iframed live boards).
          The flex-column / sticky-footer scaffold lives inside AppShell now. */}
      <body className="min-h-screen">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
