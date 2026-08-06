"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { AgentForkButton } from "@/app/lib/AgentForkButton";
import { LikeButton } from "@/app/lib/LikeButton";
import { Button } from "@/app/components/ui/button";

// DashboardView is client-only (shared WS + browser APIs) → dynamic ssr:false.
const DashboardView = dynamic(() => import("@/app/lib/DashboardView"), {
  ssr: false,
});

const TINKER_KEY = "zframes:tinker-spec";

export function DashboardPreview({
  id,
  title,
  spec,
  likes,
}: {
  id: string;
  title: string;
  spec: unknown;
  likes: number;
}) {
  const router = useRouter();

  // "Make it mine": copy the spec into the local tinker slot, then open the
  // editor. Snapshot-and-fork — no server write, the recipient owns a copy.
  const fork = useCallback(() => {
    try {
      window.localStorage.setItem(TINKER_KEY, JSON.stringify(spec));
    } catch {
      /* localStorage unavailable — the editor still opens with its own default */
    }
    router.push("/tinker");
  }, [spec, router]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xs text-white/55 hover:text-white">
              ← Gallery
            </Link>
          </div>
          <h1 className="text-xl font-semibold text-white">{title}</h1>
        </div>
        {/* Like sits LEFT of the fork pair and stays outline-quiet: this page's
            conversion goal is "fork it onto your machine", and a like button that
            competes with that CTA would trade the thing we want for a cheap tap. */}
        <div className="flex items-center gap-2">
          <LikeButton kind="dashboard" id={id} initialTotal={likes} />
          <AgentForkButton id={id} />
          <Button variant="accent" size="sm" onClick={fork}>
            Tinker here →
          </Button>
        </div>
      </div>
      <DashboardView spec={spec} />
    </main>
  );
}
