"use client";

import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { authClient } from "@/app/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";

// Header auth widget — rendered inside the (server) layout nav.
//
// Deliberately NO persistent "Sign in" CTA: an account is the price of writing
// (publish, My dashboards), never of using the product, so the prompt surfaces
// in-context at those gated moments (PublishDialog, /mine) instead of nagging
// from the chrome. Logged-out (and while the session resolves) this renders
// nothing.
//
// Signed in: the account email is a shadcn DropdownMenu trigger — clicking it
// opens the account routes + Sign out.
export function AuthNav() {
  const { data, isPending } = authClient.useSession();

  if (isPending || !data?.user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/70 outline-none transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-white/[0.06] data-[state=open]:text-white">
        <span className="max-w-[16ch] truncate">{data.user.email}</span>
        <ChevronDownIcon className="size-3 text-white/45 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem asChild>
          <Link href="/mine">My dashboards</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            authClient.signOut().then(() => window.location.reload())
          }
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
