"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  title: string;
  status: "pending" | "approved" | "removed";
  visibility: "listed" | "unlisted";
  reportCount: number;
};

export default function ModeratePage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/moderate");
    if (r.status === 403) {
      setForbidden(true);
      return;
    }
    setForbidden(false);
    setRows(await r.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, status: "approved" | "removed") {
    await fetch("/api/moderate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    load();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-bold text-white">Moderation</h1>
      <p className="mb-6 text-sm text-white/45">
        Reported dashboards, most-reported first. Remove takes it down everywhere;
        restore re-approves.
      </p>

      {forbidden ? (
        <p className="text-sm text-white/50">
          Admins only.{" "}
          <Link href="/signin" className="text-indigo-400 hover:underline">
            Sign in
          </Link>{" "}
          with an allowlisted account.
        </p>
      ) : rows === null ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-white/50">No reports. All clear.</p>
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
                  <span className="text-rose-400/90">{d.reportCount} reports</span>
                  <span>· {d.visibility}</span>
                  <span
                    className={
                      d.status === "removed" ? "text-rose-400" : "text-emerald-400/80"
                    }
                  >
                    · {d.status}
                  </span>
                </div>
              </div>
              {d.status === "removed" ? (
                <button
                  onClick={() => act(d.id, "approved")}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:text-white"
                >
                  Restore
                </button>
              ) : (
                <button
                  onClick={() => act(d.id, "removed")}
                  className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/20"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
