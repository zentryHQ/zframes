"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SectionHeading } from "@/app/lib/SectionHeading";
import { Button } from "@/app/components/ui/button";

type Row = {
  id: string;
  title: string;
  visibility: "listed" | "unlisted";
  tags: string[];
  views: number;
  frameCount: number;
};

export default function MyDashboardsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [needAuth, setNeedAuth] = useState(false);
  // Two-step destructive action: first click arms this id, second click deletes.
  const [armed, setArmed] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/dashboards/mine");
    if (r.status === 401) {
      setNeedAuth(true);
      return;
    }
    setNeedAuth(false);
    setRows(await r.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(null), 3500);
    return () => window.clearTimeout(t);
  }, [armed]);

  async function del(id: string) {
    setArmed(null);
    const r = await fetch(`/api/dashboards/${id}`, { method: "DELETE" });
    if (!r.ok) {
      toast.error("Couldn't delete that dashboard — try again.");
      return;
    }
    toast.success("Dashboard deleted");
    load();
  }

  async function toggleVisibility(id: string, current: Row["visibility"]) {
    const visibility = current === "listed" ? "unlisted" : "listed";
    const r = await fetch(`/api/dashboards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    });
    if (!r.ok) {
      toast.error("Couldn't update visibility — try again.");
      return;
    }
    toast.success(
      visibility === "listed"
        ? "Listed in the gallery"
        : "Unlisted — link-only",
    );
    load();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <SectionHeading
        eyebrow="Your account"
        title="My dashboards"
        description="Boards you've published. Preview any live, or manage visibility below."
      />

      {needAuth ? (
        <div className="zf-surface flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-white/70">
            Sign in to see the dashboards you've published. Browsing, preview,
            and tinker never need an account — only publishing does.
          </p>
          <Button asChild variant="accent" size="sm">
            <Link href="/signin?next=/mine">Sign in</Link>
          </Button>
        </div>
      ) : rows === null ? (
        <div className="space-y-2.5" aria-hidden>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="zf-surface h-[74px] animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="zf-surface flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-white/70">
            Nothing published yet — build a board in the tinker editor, then hit
            Publish to get a shareable link.
          </p>
          <Button asChild variant="accent" size="sm">
            <Link href="/tinker">Open the tinker editor →</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((d) => (
            <li
              key={d.id}
              className="zf-surface card-lift flex items-center justify-between gap-4 px-4 py-3.5"
            >
              <div className="min-w-0">
                <Link
                  href={`/d/${d.id}`}
                  className="font-medium text-white transition-colors hover:text-indigo-300"
                >
                  {d.title}
                </Link>
                <div className="mt-1 flex items-center gap-2 font-mono text-xs text-white/55">
                  <span
                    className={
                      d.visibility === "listed"
                        ? "inline-flex items-center gap-1 text-up"
                        : "text-white/55"
                    }
                  >
                    {d.visibility === "listed" && (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-up" />
                    )}
                    {d.visibility}
                  </span>
                  <span>· {d.frameCount} frames</span>
                  <span>· {d.views} views</span>
                  <code className="text-white/55">/d/{d.id}</code>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-xs text-white/60 hover:border-indigo-400/40 hover:text-indigo-200"
                  onClick={() => toggleVisibility(d.id, d.visibility)}
                >
                  {d.visibility === "listed" ? "Unlist" : "List"}
                </Button>
                {armed === d.id ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="text-xs"
                    onClick={() => del(d.id)}
                  >
                    Confirm delete
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/10 text-xs text-white/60 hover:border-down/40 hover:text-down"
                    onClick={() => setArmed(d.id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
