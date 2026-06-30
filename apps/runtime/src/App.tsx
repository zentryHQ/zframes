import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  DashboardRenderer,
  DashboardSpecSchema,
  FramesProvider,
  type DashboardSpec,
} from "@zframes/core";
import {
  DASHBOARD_READ_ROUTE,
  DASHBOARD_WRITE_ROUTE,
} from "@zframes/core/routes";
import { AlternativeMeProvider } from "@zframes/provider-alternativeme";
import { BinanceProvider } from "@zframes/provider-binance";
import { BlsProvider } from "@zframes/provider-bls";
import { CoinGeckoProvider } from "@zframes/provider-coingecko";
import { CoinpaprikaProvider } from "@zframes/provider-coinpaprika";
import { DefiLlamaProvider } from "@zframes/provider-defillama";
import { DeribitProvider } from "@zframes/provider-deribit";
import { FinraProvider } from "@zframes/provider-finra";
import { HyperliquidProvider } from "@zframes/provider-hyperliquid";
import { MempoolProvider } from "@zframes/provider-mempool";
import { NewsProvider } from "@zframes/provider-news";
import { NyFedProvider } from "@zframes/provider-nyfed";
import { OfrProvider } from "@zframes/provider-ofr";
import { SecProvider } from "@zframes/provider-sec";
import { TreasuryProvider } from "@zframes/provider-treasury";
import { WalletProvider } from "@zframes/provider-wallet";
import { DashboardBackground } from "./background";
import { DashboardSwitcher } from "./dashboard-switcher";
import { createLazyRegistry } from "./lazy-registry";
import { TickerTape } from "./ticker-tape";
import { useIsDesktop } from "./use-is-desktop";
import { ZaiOrb } from "./zai-orb";

// The GridStack editor is desktop-only and heavy (GridStack + its CSS side-effect
// import + editor-only icons). Lazy-load it so the dashboard paints through
// DashboardRenderer first and the editor chunk swaps in once it's loaded.
const DashboardEditor = lazy(() =>
  import("@zframes/core/editor").then((m) => ({ default: m.DashboardEditor })),
);

const registry = createLazyRegistry();
const providers = [
  new HyperliquidProvider(),
  new DefiLlamaProvider(),
  new AlternativeMeProvider(),
  new CoinGeckoProvider(),
  new CoinpaprikaProvider(),
  new NyFedProvider(),
  new TreasuryProvider(),
  new BlsProvider(),
  new SecProvider(),
  new FinraProvider(),
  new OfrProvider(),
  new NewsProvider(),
  new MempoolProvider(),
  new DeribitProvider(),
  new BinanceProvider(),
  new WalletProvider(),
];

// The runtime serves the user's dashboard.json at DASHBOARD_READ_ROUTE. Both
// `vite dev` (via @zframes/core/vite) and `zframes serve` answer it, so a single
// prebuilt bundle renders whatever file the server is pointed at — the spec is
// never compiled in. The route strings come from @zframes/core/routes so the
// app and the servers can't drift apart.

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
    const res = await fetch(DASHBOARD_WRITE_ROUTE, {
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
  // Same for accent saturation — the editor reports it so the :root chart tokens
  // and the background scene's saturate() filter follow the slider live, not just
  // on reload (the editor's own cards already track it via an inline var).
  const [liveSat, setLiveSat] = useState<number | null>(null);
  // Live text scale the editor reports while customising (null = not editing →
  // fall back to the saved spec value). Applied as the root font size below so
  // the rem-based chart text and titles scale; held here, above the editor, so
  // it follows the slider live, not just on reload.
  const [liveScale, setLiveScale] = useState<number | null>(null);
  // Live semantic up/down colors the editor reports while customising. Pushed to
  // :root below so host chrome that lives OUTSIDE the dashboard container —
  // notably the ticker tape — follows them too (the in-grid frames already get
  // them from the container's inline vars). null = not editing → saved spec.
  const [liveUp, setLiveUp] = useState<string | null>(null);
  const [liveDown, setLiveDown] = useState<string | null>(null);
  // Live layout mode the editor reports while customising (null = not editing →
  // fall back to the saved spec value). flow-horizontal is full-bleed, so the
  // host's centred max-width has to drop — and that decision lives here, on
  // <main>, above the editor.
  const [liveMode, setLiveMode] = useState<
    DashboardSpec["grid"]["mode"] | null
  >(null);
  // Live background the editor reports while customising (null = not editing →
  // fall back to the saved spec). Held above the editor because the full-bleed
  // <DashboardBackground> renders here, outside the editor — so a scene swap,
  // opacity drag, or none/gradient toggle repaints the real backdrop live.
  const [liveBackground, setLiveBackground] = useState<
    DashboardSpec["background"] | null
  >(null);
  // Editing stays a desktop activity: only >=1024px gets the editable GridStack
  // editor. Phones and tablets get the read-only CSS-grid renderer, which
  // reflows itself (single column <=640px, two columns 641-1023px).
  const isDesktop = useIsDesktop();
  // Lifted from the zAI orb: when the orb is open, the background recolors +
  // brightens so opening zAI visibly "charges" the scene behind the dashboard.
  const [orbOpen, setOrbOpen] = useState(false);
  // Also lifted from the orb: while zAI is *thinking* (busy answering), the
  // background comes alive — it cycles its hue and breathes (see background.tsx).
  const [orbThinking, setOrbThinking] = useState(false);

  const accentHue =
    liveHue ?? (load.status === "ready" ? load.spec.theme.accentHue : null);
  const accentSat =
    liveSat ?? (load.status === "ready" ? load.spec.theme.accentSat : null);
  const fontScale =
    liveScale ?? (load.status === "ready" ? load.spec.typography.scale : null);
  const upColor =
    liveUp ?? (load.status === "ready" ? load.spec.theme.upColor : null);
  const downColor =
    liveDown ?? (load.status === "ready" ? load.spec.theme.downColor : null);
  // --color-highlight (chart layer) is declared in @theme → resolved at :root,
  // so it only follows the accent if :root carries the knobs. Pushing both here
  // lets the heading-frame dots and chart highlights track the sliders live.
  useEffect(() => {
    if (accentHue == null) return;
    document.documentElement.style.setProperty(
      "--zf-accent-hue",
      String(accentHue),
    );
  }, [accentHue]);
  useEffect(() => {
    if (accentSat == null) return;
    document.documentElement.style.setProperty(
      "--zf-accent-sat",
      `${accentSat}%`,
    );
  }, [accentSat]);
  // spec.typography.scale rides the root font size: chart text and card titles
  // are rem-based, so scaling <html>'s font-size is the only lever that grows
  // them together. 1 → 100% (the browser default), a no-op.
  useEffect(() => {
    if (fontScale == null) return;
    document.documentElement.style.fontSize = `${fontScale * 100}%`;
  }, [fontScale]);
  // Push the semantic up/down colors to :root so the ticker tape (host chrome,
  // outside the dashboard container) tints its deltas with them, matching the
  // in-grid frames. UP_COLOR/DOWN_COLOR resolve --zf-up/--zf-down.
  useEffect(() => {
    if (upColor == null) return;
    document.documentElement.style.setProperty("--zf-up", upColor);
  }, [upColor]);
  useEffect(() => {
    if (downColor == null) return;
    document.documentElement.style.setProperty("--zf-down", downColor);
  }, [downColor]);

  useEffect(() => {
    // Fetch once on mount. StrictMode runs this twice in dev; the `cancelled`
    // guard makes the discarded first run a no-op (a GET is idempotent anyway).
    let cancelled = false;
    fetch(DASHBOARD_READ_ROUTE, { cache: "no-store" })
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
  // flow-horizontal is full-bleed: it drops the centred max-width so the board
  // uses the whole viewport width and scrolls sideways. liveMode wins while
  // customising; otherwise the saved spec decides.
  const isHorizontal = (liveMode ?? spec.grid.mode) === "flow-horizontal";

  return (
    <FramesProvider providers={providers}>
      <DashboardBackground
        background={liveBackground ?? spec.background}
        active={orbOpen}
        thinking={orbThinking}
        accentHue={accentHue ?? spec.theme.accentHue}
        accentSat={accentSat ?? spec.theme.accentSat}
      />
      <main
        className={`relative z-10 mx-auto pt-5 ${
          isHorizontal
            ? "h-[100dvh] max-w-none overflow-hidden px-0"
            : "max-w-[1320px] px-4 pb-24 sm:px-6"
        }`}
        style={
          {
            ["--zf-accent-hue"]: accentHue ?? spec.theme.accentHue,
            ["--zf-accent-sat"]: `${accentSat ?? spec.theme.accentSat}%`,
          } as CSSProperties
        }
      >
        <header
          className={`mb-5 flex flex-col gap-2 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-center sm:justify-between ${
            isHorizontal ? "px-4 sm:px-6" : ""
          }`}
        >
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
            <DashboardSwitcher currentTitle={spec.title} />
            <span
              className="caption text-soft rounded-full border border-white/[0.08] px-1.5 py-0.5 font-mono leading-none"
              title="zframes runtime version"
            >
              v{__ZFRAMES_VERSION__}
            </span>
          </div>
          <div
            ref={setCustomiseButtonTarget}
            className="flex min-h-9 items-center justify-end"
          />
        </header>
        {!isDesktop ? (
          <DashboardRenderer spec={spec} registry={registry} />
        ) : (
          <Suspense
            fallback={<DashboardRenderer spec={spec} registry={registry} />}
          >
            <DashboardEditor
              spec={spec}
              registry={registry}
              onSave={persist}
              customiseButtonTarget={customiseButtonTarget}
              onAccentHueChange={setLiveHue}
              onAccentSatChange={setLiveSat}
              onFontScaleChange={setLiveScale}
              onUpColorChange={setLiveUp}
              onDownColorChange={setLiveDown}
              onModeChange={setLiveMode}
              onBackgroundChange={setLiveBackground}
            />
          </Suspense>
        )}
      </main>
      <TickerTape />
      <ZaiOrb
        onOpenChange={setOrbOpen}
        onThinkingChange={setOrbThinking}
        spec={spec}
        registry={registry}
      />
    </FramesProvider>
  );
}
