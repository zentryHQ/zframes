"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SectionHeading } from "@/app/lib/SectionHeading";

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

  async function del(id: string) {
    await fetch(`/api/dashboards/${id}`, { method: "DELETE" });
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
        <p className="text-sm text-white/50">
          <Link href="/signin" className="text-indigo-400 hover:underline">
            Sign in
          </Link>{" "}
          to see the dashboards you've published.
        </p>
      ) : rows === null ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-white/50">
          Nothing published yet — build one in the{" "}
          <Link href="/tinker" className="text-indigo-400 hover:underline">
            tinker
          </Link>{" "}
          editor and hit Publish.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((d) => (
            <li
              key={d.id}
              className="card-lift hairline flex items-center justify-between gap-4 rounded-xl bg-white/[0.02] px-4 py-3.5"
            >
              <div className="min-w-0">
                <Link
                  href={`/d/${d.id}`}
                  className="font-medium text-white transition-colors hover:text-indigo-300"
                >
                  {d.title}
                </Link>
                <div className="mt-1 flex items-center gap-2 font-mono text-xs text-white/40">
                  <span
                    className={
                      d.visibility === "listed"
                        ? "inline-flex items-center gap-1 text-emerald-400/90"
                        : "text-white/40"
                    }
                  >
                    {d.visibility === "listed" && (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    )}
                    {d.visibility}
                  </span>
                  <span>· {d.frameCount} frames</span>
                  <span>· {d.views} views</span>
                  <code className="text-white/30">/d/{d.id}</code>
                </div>
              </div>
              <button
                type="button"
                onClick={() => del(d.id)}
                className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/50 transition-colors hover:border-rose-500/40 hover:text-rose-300"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
