import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "zframes explorer — Tailwind v4 spike",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
