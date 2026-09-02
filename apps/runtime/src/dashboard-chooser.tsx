import { memo, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useEscapeLayer } from "@zframes/core";
import {
  DASHBOARD_LIST_ROUTE,
  DASHBOARD_SWITCH_ROUTE,
} from "@zframes/spec/routes";

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

// The chooser's ink and edges, at whatever lightness the surface mode publishes
// on <html> (App writes surfaceModeVars there from spec.theme.surface). The
// panel used to be hard-coded dark chrome — literal `white/[…]` utilities and
// bg-neutral-950 — which theme.surface could never reach, so a light board got
// a dark modal. The fallbacks reproduce the previous dark values exactly.
const ink = (alpha: number) => `hsl(0 0% var(--zf-ink-l, 100%) / ${alpha})`;

// Only the hover states need a stylesheet (an inline style can't express one);
// every static colour below is inline. Unlayered, so these beat the Tailwind
// utilities they replace.
const CHOOSER_CSS = `
.zf-chooser-trigger:hover, .zf-chooser-close:hover {
  color: hsl(0 0% var(--zf-ink-l, 100%) / 0.95);
}
.zf-chooser-card:hover {
  border-color: hsl(0 0% var(--zf-ink-l, 100%) / 0.25);
  background: hsl(0 0% var(--zf-ink-l, 100%) / 0.03);
}
`;

/** Everything Tab can land on inside the panel, in document order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export const DashboardChooser = memo(function DashboardChooser({
  currentTitle,
  dirty = false,
}: {
  currentTitle: string;
  /**
   * Whether the editor is holding unsaved edits. A switch reloads the page,
   * which discards them with no way back, so while this is set the switch asks
   * first. Reported up from the editor through App (`onDirtyChange`).
   */
  dirty?: boolean;
}) {
  const [info, setInfo] = useState<ChooserInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  // Close the overlay on Escape — through the shared stack, so a press with the
  // orb also open closes the topmost surface only. This used to be its own
  // window listener, and both surfaces answered the same press.
  useEscapeLayer(open, () => setOpen(false));

  // The overlay claims aria-modal, so focus has to behave like one: land inside
  // the panel on open (it was left on the page underneath, where Tab walked
  // straight through the content behind the scrim) and go back to the trigger
  // on close, including the close-by-switch case where the trigger is gone and
  // the call is a harmless no-op.
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    panelRef.current?.focus();
    return () => trigger?.focus();
  }, [open]);

  // Tab trap. Only the panel's own controls are reachable while it is open;
  // wrapping at both ends is what keeps focus out of the inert page behind it.
  function trapTab(event: KeyboardEvent<HTMLDivElement>) {
    const panel = panelRef.current;
    if (event.key !== "Tab" || !panel) return;
    const stops = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (stops.length === 0) {
      event.preventDefault();
      return;
    }
    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = document.activeElement;
    // The panel itself is the initial focus target (tabIndex -1), so a first
    // Shift+Tab from there wraps to the end rather than escaping upwards.
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const plainTitle = (
    <span className="body-sm" style={{ color: ink(0.6) }}>
      {currentTitle}
    </span>
  );
  // Nothing to choose between (dev, explicit path, or a single-dashboard store).
  if (!info || info.dashboards.length <= 1) return plainTitle;

  async function choose(name: string) {
    if (!info || switching) return;
    if (name === info.current) {
      setOpen(false);
      return;
    }
    // Switching reloads into the other dashboard, which discards an unsaved
    // customise session with no draft and no way back — so ask, rather than
    // silently throwing the work away.
    if (
      dirty &&
      !window.confirm(
        "This board has unsaved changes. Switching dashboards discards them. Switch anyway?",
      )
    )
      return;
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
      <style>{CHOOSER_CSS}</style>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="body-sm zf-chooser-trigger flex items-center gap-1 rounded-md border px-1.5 py-0.5 outline-none"
        style={{ color: ink(0.6), borderColor: ink(0.08) }}
      >
        {currentTitle}
        <span aria-hidden className="text-[0.7em] opacity-70">
          ▾
        </span>
      </button>
      {open &&
        createPortal(
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          >
            {/* The dialog is the PANEL, not the scrim: aria-modal has to sit on
                the element focus is trapped inside, and it takes focus itself
                (tabIndex -1) so opening lands here rather than leaving the
                keyboard on the page behind the overlay. */}
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Choose a dashboard"
              tabIndex={-1}
              onKeyDown={trapTab}
              className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5 shadow-2xl outline-none"
              style={{
                background: `hsl(232 22% var(--zf-surf-l3, 5.3%) / 0.95)`,
                border: `1px solid ${ink(0.08)}`,
              }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2
                  className="font-dmsans text-base font-extrabold"
                  style={{ color: ink(0.95) }}
                >
                  Your dashboards
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="zf-chooser-close rounded-md px-2 py-0.5 text-lg leading-none outline-none"
                  style={{ color: ink(0.6) }}
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
                          ? {
                              borderColor: `${accent} 60%)`,
                              background: ink(0.04),
                            }
                          : { borderColor: ink(0.08) }
                      }
                      className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left outline-none transition active:scale-[0.98] active:duration-0 disabled:opacity-50 ${
                        isCurrent ? "" : "zf-chooser-card"
                      }`}
                    >
                      <span
                        className="font-dmsans text-sm font-bold"
                        style={{ color: ink(0.95) }}
                      >
                        {d.title ?? d.name}
                      </span>
                      <span
                        className="caption font-mono"
                        style={{ color: ink(0.6) }}
                      >
                        {d.name}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {d.isDefault && (
                          <span
                            className="caption rounded-full border px-1.5 py-0.5 leading-none"
                            style={{ color: ink(0.6), borderColor: ink(0.12) }}
                          >
                            default
                          </span>
                        )}
                        {isCurrent && (
                          <span
                            className="caption rounded-full px-1.5 py-0.5 leading-none"
                            style={{
                              background: `${accent} 30%)`,
                              color: ink(0.95),
                            }}
                          >
                            current
                          </span>
                        )}
                        {switching === d.name && (
                          <span className="caption" style={{ color: ink(0.6) }}>
                            switching…
                          </span>
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
});
