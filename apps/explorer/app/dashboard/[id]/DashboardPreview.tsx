"use client";

import { DashboardSpecSchema } from "@zframes/spec/spec";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { AgentForkButton } from "@/app/lib/AgentForkButton";
import { DashboardBackground } from "@/app/lib/DashboardBackground";
import { LikeButton } from "@/app/lib/LikeButton";
import { Button } from "@/app/components/ui/button";

// DashboardView is client-only (shared WS + browser APIs) → dynamic ssr:false.
const DashboardView = dynamic(() => import("@/app/lib/DashboardView"), {
  ssr: false,
});

// One-shot handoff slot: /editor reads this FIRST (before its own saved board),
// then clears it — so "Edit this board" always opens THIS board, without
// silently overwriting the visitor's saved work until they hit Save.
// Must match HANDOFF_KEY in app/editor/EditorView.tsx.
const EDITOR_HANDOFF_KEY = "zframes:editor-handoff";

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

  // Parse only to read the background + accent for the backdrop — same as
  // EmbedBoard. DashboardView re-parses and owns the invalid-spec message, so a
  // bad spec just skips the board backdrop (the body gradient shows through;
  // AppShell's site Aurora is deliberately absent on /dashboard/*).
  const parsed = useMemo(() => DashboardSpecSchema.safeParse(spec), [spec]);

  // "Make it mine": copy the spec into the handoff slot, then open the
  // editor. Snapshot-and-fork — no server write, the recipient owns a copy.
  const fork = useCallback(() => {
    try {
      window.localStorage.setItem(EDITOR_HANDOFF_KEY, JSON.stringify(spec));
    } catch {
      /* localStorage unavailable — the editor still opens with its own default */
    }
    router.push("/editor");
  }, [spec, router]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-6">
      {/* The board's OWN declared background (unicorn scene / gradient / image),
          replacing the site Aurora that AppShell suppresses on this route.
          Wrapped at z-[-1] so an opaque fill never paints over the header/footer
          chrome — DashboardBackground's own layers sit at z-0 for the bare
          /embed/* documents. pointer-events-none on the wrapper: fixed inset-0
          would otherwise swallow every click on the page. */}
      {parsed.success && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[-1]">
          <DashboardBackground
            background={parsed.data.background}
            accentHue={parsed.data.theme.accentHue}
            accentSat={parsed.data.theme.accentSat}
          />
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xs text-white/55 hover:text-white">
              ← Home
            </Link>
          </div>
          <h1 className="text-xl font-semibold text-white">{title}</h1>
          {/* The mock-data disclosure for a deep-linked visitor: every number
              on this page is simulated (see AGENTS.md § Mock data only), and
              this line is where they learn it — stated plainly, no badge. */}
          <p className="mt-1 text-xs text-white/55">
            Simulated preview — live data comes from running this board on your
            machine.
          </p>
        </div>
        {/* Like sits LEFT of the fork pair and stays outline-quiet: this page's
            conversion goal is "fork it onto your machine", and a like button that
            competes with that CTA would trade the thing we want for a cheap tap. */}
        <div className="flex flex-wrap items-center gap-2">
          <LikeButton kind="dashboard" id={id} initialTotal={likes} />
          <AgentForkButton id={id} />
          <Button variant="accent" size="sm" onClick={fork}>
            Edit this board →
          </Button>
        </div>
      </div>
      <DashboardView spec={spec} />
    </main>
  );
}
