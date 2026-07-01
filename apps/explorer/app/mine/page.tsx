"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-bold text-white">My dashboards</h1>

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
        <ul className="space-y-2">
          {rows.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
            >
              <div className="min-w-0">
                <Link href={`/d/${d.id}`} className="font-medium text-white hover:text-indigo-300">
                  {d.title}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-white/40">
                  <span
                    className={
                      d.visibility === "listed" ? "text-emerald-400/80" : "text-white/40"
                    }
                  >
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
                className="text-xs text-white/40 hover:text-rose-400"
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
