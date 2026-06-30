import { useEffect, useState } from "react";
import {
  DASHBOARD_LIST_ROUTE,
  DASHBOARD_SWITCH_ROUTE,
} from "@zframes/core/routes";

// The store switcher: when `zframes serve` is hosting a *named* store dashboard
// it answers DASHBOARD_LIST_ROUTE with the dashboards available to switch among.
// Under `vite dev` or an explicit-path serve those routes are absent / report
// canSwitch:false, so this component quietly falls back to the static title —
// no dropdown unless switching is genuinely possible AND there's more than one.

interface Entry {
  name: string;
  title: string | null;
  isDefault: boolean;
}
interface SwitchInfo {
  current: string | null;
  dashboards: Entry[];
}

export function DashboardSwitcher({ currentTitle }: { currentTitle: string }) {
  const [info, setInfo] = useState<SwitchInfo | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(DASHBOARD_LIST_ROUTE, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: unknown) => {
        if (cancelled || !json || typeof json !== "object") return;
        const data = json as {
          current?: unknown;
          canSwitch?: unknown;
          dashboards?: unknown;
        };
        if (data.canSwitch === true && Array.isArray(data.dashboards)) {
          setInfo({
            current: typeof data.current === "string" ? data.current : null,
            dashboards: data.dashboards as Entry[],
          });
        }
      })
      .catch(() => {
        /* no switcher available — keep the static title */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fallback = <span className="body-sm text-soft">{currentTitle}</span>;
  // Nothing to switch to (dev, explicit path, or a single-dashboard store).
  if (!info || info.dashboards.length <= 1) return fallback;

  async function switchTo(name: string) {
    if (!info || !name || name === info.current || switching) return;
    setSwitching(true);
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
      setSwitching(false);
    }
  }

  return (
    <select
      aria-label="Switch dashboard"
      className="body-sm text-soft hover:text-strong cursor-pointer rounded-md border border-white/[0.08] bg-transparent px-1.5 py-0.5 outline-none disabled:opacity-50"
      value={info.current ?? ""}
      disabled={switching}
      onChange={(e) => void switchTo(e.target.value)}
    >
      {info.dashboards.map((d) => (
        <option
          key={d.name}
          value={d.name}
          className="text-strong bg-neutral-900"
        >
          {d.title ? `${d.title} (${d.name})` : d.name}
        </option>
      ))}
    </select>
  );
}
