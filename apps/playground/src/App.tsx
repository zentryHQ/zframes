import { useEffect, useState, type ReactNode } from "react";
import {
  createRegistry,
  DashboardSpecSchema,
  FramesProvider,
  type DashboardSpec,
} from "@zframes/core";
import { DashboardEditor } from "@zframes/core/editor";
import { allFrames } from "@zframes/frames";
import { AlternativeMeProvider } from "@zframes/provider-alternativeme";
import { CoinGeckoProvider } from "@zframes/provider-coingecko";
import { DefiLlamaProvider } from "@zframes/provider-defillama";
import { HyperliquidProvider } from "@zframes/provider-hyperliquid";
import { DashboardBackground } from "./background";

const registry = createRegistry(allFrames);
const providers = [
  new HyperliquidProvider(),
  new DefiLlamaProvider(),
  new AlternativeMeProvider(),
  new CoinGeckoProvider(),
];

// The runtime serves the user's dashboard.json at this route. Both `vite dev`
// (via @zframes/core/vite) and `zframes serve` answer it, so a single prebuilt
// bundle renders whatever file the server is pointed at — the spec is never
// compiled in.
const SPEC_ROUTE = "/__zframes/dashboard.json";

type SpecIssue = { path: PropertyKey[]; message: string };
type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "invalid"; issues: SpecIssue[] }
  | { status: "ready"; spec: DashboardSpec };

function Centered({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-2xl px-6 py-16">{children}</main>;
}

function Splash() {
  return (
    <Centered>
      <p className="body-sm text-soft">loading dashboard…</p>
    </Centered>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <Centered>
      <h1 className="font-dmsans text-strong mb-2 text-lg font-extrabold">
        couldn&rsquo;t load your dashboard
      </h1>
      <p className="body-sm text-soft mb-4">
        The zframes runtime couldn&rsquo;t read <code>dashboard.json</code>.
        Make sure you&rsquo;re running <code>zframes serve</code> next to it.
      </p>
      <p className="caption text-soft">
        <code>{message}</code>
      </p>
    </Centered>
  );
}

// Per-frame config errors render as error cards (see DashboardRenderer); a
// malformed *top-level* spec is caught here so a bad dashboard.json shows a
// readable message instead of a blank screen.
function SpecError({ issues }: { issues: SpecIssue[] }) {
  return (
    <Centered>
      <h1 className="font-dmsans text-strong mb-2 text-lg font-extrabold">
        dashboard.json is not a valid spec
      </h1>
      <p className="body-sm text-soft mb-4">
        Fix the issues below (or run <code>zframes lint dashboard.json</code>),
        then reload.
      </p>
      <ul className="body-sm text-normal list-disc space-y-1 pl-5">
        {issues.map((issue, i) => (
          <li key={i}>
            <code>{issue.path.join(".") || "(root)"}</code>: {issue.message}
          </li>
        ))}
      </ul>
    </Centered>
  );
}

// Persist editor changes back to the real dashboard.json via the runtime's
// write-back endpoint (the @zframes/core/vite plugin in dev, the `zframes serve`
// http server in prod). On success we reload so the editor re-renders from the
// file it just wrote — the round-trip is the proof. The endpoint is always
// hosted, so a failure is unexpected: surface it and keep the edits on screen
// (the editor's own "Export JSON" stays as a manual escape hatch).
async function persist(next: DashboardSpec) {
  try {
    const res = await fetch("/__zframes/dashboard", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    window.location.reload();
  } catch (error) {
    console.error("zframes: failed to save dashboard.json", error);
    window.alert(
      "Couldn't save dashboard.json — is `zframes serve` still running? Your edits are still on screen; try Save again.",
    );
  }
}

export default function App() {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    // Fetch once on mount. StrictMode runs this twice in dev; the `cancelled`
    // guard makes the discarded first run a no-op (a GET is idempotent anyway).
    let cancelled = false;
    fetch(SPEC_ROUTE, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        const parsed = DashboardSpecSchema.safeParse(json);
        setLoad(
          parsed.success
            ? { status: "ready", spec: parsed.data }
            : { status: "invalid", issues: parsed.error.issues },
        );
      })
      .catch((error) => {
        if (cancelled) return;
        setLoad({ status: "error", message: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (load.status === "loading") return <Splash />;
  if (load.status === "error") return <LoadError message={load.message} />;
  if (load.status === "invalid") return <SpecError issues={load.issues} />;
  const spec = load.spec;

  return (
    <FramesProvider providers={providers}>
      <DashboardBackground background={spec.background} />
      <main className="relative z-10 mx-auto max-w-[1320px] px-4 pb-16 pt-5 sm:px-6">
        <header className="mb-5 flex flex-col gap-2 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-baseline sm:justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="font-dmsans text-strong text-lg font-extrabold tracking-tight">
              z<span className="text-[#8b8df9]">frames</span>
            </h1>
            <span className="body-sm text-soft">{spec.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="caption text-soft">
              <span className="sm:hidden">live · no API keys</span>
              <span className="hidden sm:inline">
                live · hyperliquid + defillama + alternative.me + coingecko · no
                API keys
              </span>
            </span>
          </div>
        </header>
        <DashboardEditor spec={spec} registry={registry} onSave={persist} />
      </main>
    </FramesProvider>
  );
}
