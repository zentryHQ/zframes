import type { Metadata } from "next";
import type { ReactNode } from "react";

// Metadata carrier for the client `page.tsx` below it — see app/mine/layout.tsx
// for why a layout is the only place this can go. An auth screen has no content
// worth indexing and every reason not to be a search result.
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function SignInLayout({ children }: { children: ReactNode }) {
  return children;
}
