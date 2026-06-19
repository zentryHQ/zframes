import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  createRegistry,
  DashboardRenderer,
  DashboardSpecSchema,
  FramesProvider,
  type DashboardSpec,
} from "@zframes/core";
import { DashboardEditor } from "@zframes/core/editor";
import { allFrames } from "@zframes/frames";
import { AlternativeMeProvider } from "@zframes/provider-alternativeme";
import { BlsProvider } from "@zframes/provider-bls";
import { CoinGeckoProvider } from "@zframes/provider-coingecko";
import { DefiLlamaProvider } from "@zframes/provider-defillama";
import { FinraProvider } from "@zframes/provider-finra";
import { HyperliquidProvider } from "@zframes/provider-hyperliquid";
import { NyFedProvider } from "@zframes/provider-nyfed";
import { SecProvider } from "@zframes/provider-sec";
import { TreasuryProvider } from "@zframes/provider-treasury";
import { DashboardBackground } from "./background";
import { TickerTape } from "./ticker-tape";
import { useIsMobile } from "./use-is-mobile";
import { ZaiOrb } from "./zai-orb";

const registry = createRegistry(allFrames);
const providers = [
  new HyperliquidProvider(),
  new DefiLlamaProvider(),
  new AlternativeMeProvider(),
  new CoinGeckoProvider(),
  new NyFedProvider(),
  new TreasuryProvider(),
  new BlsProvider(),
  new SecProvider(),
  new FinraProvider(),
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
  const [customiseButtonTarget, setCustomiseButtonTarget] =
    useState<HTMLDivElement | null>(null);
  // Live accent hue the editor reports while customising (null = not editing →
  // fall back to the saved spec value). Held here, above the editor, so the
  // header and :root-scoped tokens re-tint with the slider, not just on reload.
  const [liveHue, setLiveHue] = useState<number | null>(null);
  // Phones get the read-only CSS-grid renderer (single-column reflow at <=640px);
  // desktop gets the editable GridStack editor. Editing stays a desktop activity.
  const isMobile = useIsMobile();

  const accentHue =
    liveHue ?? (load.status === "ready" ? load.spec.theme.accentHue : null);
  // --color-highlight (chart layer) is declared in @theme → resolved at :root,
  // so it only follows the hue if :root carries it. Setting it here lets the
  // heading-frame dots and chart highlights track the slider in real time.
  useEffect(() => {
    if (accentHue == null) return;
    document.documentElement.style.setProperty(
      "--zf-accent-hue",
      String(accentHue),
    );
  }, [accentHue]);

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
      <main
        className="relative z-10 mx-auto max-w-[1320px] px-4 pb-24 pt-5 sm:px-6"
        style={
          {
            ["--zf-accent-hue"]: accentHue ?? spec.theme.accentHue,
            ["--zf-accent-sat"]: `${spec.theme.accentSat}%`,
          } as CSSProperties
        }
      >
        <header className="mb-5 flex flex-col gap-2 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="font-dmsans text-strong text-lg font-extrabold tracking-tight">
              /
              <span
                style={{
                  color:
                    "hsl(var(--zf-accent-hue, 242) var(--zf-accent-sat, 90%) 76%)",
                }}
              >
                zframes
              </span>
            </h1>
            <span className="body-sm text-soft">{spec.title}</span>
          </div>
          <div
            ref={setCustomiseButtonTarget}
            className="flex min-h-9 items-center justify-end"
          />
        </header>
        {isMobile ? (
          <DashboardRenderer spec={spec} registry={registry} />
        ) : (
          <DashboardEditor
            spec={spec}
            registry={registry}
            onSave={persist}
            customiseButtonTarget={customiseButtonTarget}
            onAccentHueChange={setLiveHue}
          />
        )}
      </main>
      <TickerTape />
      <ZaiOrb />
    </FramesProvider>
  );
}
