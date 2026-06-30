import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  DASHBOARD_LIST_ROUTE,
  DASHBOARD_SWITCH_ROUTE,
} from "@zframes/core/routes";

// The dashboard chooser. `zframes serve` always opens the default dashboard; this
// adds an on-demand picker for the OTHER store dashboards. It asks the server
// (DASHBOARD_LIST_ROUTE) which dashboards exist; only when more than one is
// switchable does the header title become a button that opens a card overlay.
// Picking a card POSTs DASHBOARD_SWITCH_ROUTE and reloads into it. Under
// `vite dev`, an explicit-path serve, or a single-dashboard store, the route is
// absent / reports one entry, so this quietly falls back to the static title.

interface Entry {
  name: string;
  title: string | null;
  isDefault: boolean;
}
interface ChooserInfo {
  current: string | null;
  dashboards: Entry[];
}

export function DashboardChooser({ currentTitle }: { currentTitle: string }) {
  const [info, setInfo] = useState<ChooserInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(DASHBOARD_LIST_ROUTE, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: unknown) => {
        if (cancelled || !json || typeof json !== "object") return;
        const d = json as {
          current?: unknown;
          canSwitch?: unknown;
          dashboards?: unknown;
        };
        if (d.canSwitch === true && Array.isArray(d.dashboards)) {
          setInfo({
            current: typeof d.current === "string" ? d.current : null,
            dashboards: d.dashboards as Entry[],
          });
        }
      })
      .catch(() => {
        /* no chooser available — keep the static title */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close the overlay on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const plainTitle = <span className="body-sm text-soft">{currentTitle}</span>;
  // Nothing to choose between (dev, explicit path, or a single-dashboard store).
  if (!info || info.dashboards.length <= 1) return plainTitle;

  async function choose(name: string) {
    if (!info || switching) return;
    if (name === info.current) {
      setOpen(false);
      return;
    }
    setSwitching(name);
    try {
      const res = await fetch(DASHBOARD_SWITCH_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // The server now points at the new file; reload to fetch + render it.
      window.location.reload();
    } catch (error) {
      console.error("zframes: failed to switch dashboard", error);
      window.alert(
        "Couldn't switch dashboard — is `zframes serve` still running?",
      );
      setSwitching(null);
    }
  }

  // Accent prefix shared by the highlighted card border + the "current" pill.
  const accent = "hsl(var(--zf-accent-hue, 242) var(--zf-accent-sat, 90%)";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="body-sm text-soft hover:text-strong flex items-center gap-1 rounded-md border border-white/[0.08] px-1.5 py-0.5 outline-none"
      >
        {currentTitle}
        <span aria-hidden className="text-[0.7em] opacity-70">
          ▾
        </span>
      </button>
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose a dashboard"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          >
            <div className="w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-neutral-950/95 p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-dmsans text-strong text-base font-extrabold">
                  Your dashboards
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="text-soft hover:text-strong rounded-md px-2 py-0.5 text-lg leading-none outline-none"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {info.dashboards.map((d) => {
                  const isCurrent = d.name === info.current;
                  return (
                    <button
                      key={d.name}
                      type="button"
                      disabled={switching !== null}
                      onClick={() => void choose(d.name)}
                      style={
                        isCurrent
                          ? { borderColor: `${accent} 60%)` }
                          : undefined
                      }
                      className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left outline-none transition disabled:opacity-50 ${
                        isCurrent
                          ? "bg-white/[0.04]"
                          : "border-white/[0.08] hover:border-white/25 hover:bg-white/[0.03]"
                      }`}
                    >
                      <span className="font-dmsans text-strong text-sm font-bold">
                        {d.title ?? d.name}
                      </span>
                      <span className="caption text-soft font-mono">
                        {d.name}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {d.isDefault && (
                          <span className="caption text-soft rounded-full border border-white/[0.12] px-1.5 py-0.5 leading-none">
                            default
                          </span>
                        )}
                        {isCurrent && (
                          <span
                            className="caption text-strong rounded-full px-1.5 py-0.5 leading-none"
                            style={{ background: `${accent} 30%)` }}
                          >
                            current
                          </span>
                        )}
                        {switching === d.name && (
                          <span className="caption text-soft">switching…</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
