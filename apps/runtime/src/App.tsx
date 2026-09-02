import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { LiveCosmetics } from "@zframes/editor/editor";
import {
  DashboardRenderer,
  DashboardSpecSchema,
  FramesProvider,
  sceneBaseHue,
  type DashboardSpec,
} from "@zframes/core";
import {
  DASHBOARD_READ_ROUTE,
  DASHBOARD_WRITE_ROUTE,
} from "@zframes/spec/routes";
// Not from the @zframes/spec root barrel: @zframes/core mirrors that barrel, so
// anything added there lands on the presentation package's public API.
import { surfaceModeVars } from "@zframes/spec/spec";
import {
  resolveRuntimeProviders,
  type RuntimeProviders,
} from "@zframes/plugins/load";
import { DashboardBackground } from "./background";
import { DashboardChooser } from "./dashboard-chooser";
import { createLazyRegistry, prefetchFrames } from "./lazy-registry";
import { prefetchIdle } from "./prefetch-idle";
import { TickerTape } from "./ticker-tape";
import { DESKTOP_QUERY, useIsDesktop, useMediaQuery } from "./use-is-desktop";
import { ZaiOrb } from "./zai-orb";

// The GridStack editor is desktop-only and heavy (GridStack + its CSS side-effect
// import + editor-only icons). Lazy-load it so the dashboard paints through
// DashboardRenderer first and the editor chunk swaps in once it's loaded.
const loadEditor = () => import("@zframes/editor/editor");
const DashboardEditor = lazy(() =>
  loadEditor().then((m) => ({
    default: m.DashboardEditor,
  })),
);
// On desktop, start that download NOW — in parallel with the spec fetch — not at
// idle. The Suspense fallback below mounts the whole board through
// DashboardRenderer and swaps to the editor when its chunk lands, so every ms of
// chunk latency is a window in which all frames mount twice (poll hooks fire,
// the entrance cascade replays). Module scope beats first render by the whole
// spec round-trip; dynamic import dedupes with the lazy() call above.
// (Optional-chained: jsdom has no matchMedia until the App suite stubs it, and
// this line runs at import time, before any beforeEach.)
if (window.matchMedia?.(DESKTOP_QUERY).matches)
  void loadEditor().catch(() => {});

const registry = createLazyRegistry();
// No provider is imported here. The server names what this installation
// mounts (GET /__zframes/providers — the CLI reads the operator's `zframes
// providers` set, `vite dev` its host's composition) and
// resolveRuntimeProviders loads exactly those plugins, each as its own lazy
// chunk. No server / no route → the synthetic demo, so the board always
// renders. Kicked off at module scope, in parallel with the spec fetch (the
// effect below just awaits the memoized promise).
void resolveRuntimeProviders().catch(() => {});

// The runtime serves the user's dashboard.json at DASHBOARD_READ_ROUTE. Both
// `vite dev` (via @zframes/vite/vite) and `zframes serve` answer it, so a single
// prebuilt bundle renders whatever file the server is pointed at — the spec is
// never compiled in. The route strings come from @zframes/spec/routes so the
// app and the servers can't drift apart.

// The shell's ink, at whatever lightness the surface mode publishes on <html>
// (see the surfaceModeVars effect). Every literal `white/[…]` in the header was
// a token theme.surface could never reach, so a light board kept near-white
// text and hairlines over a light backdrop. The fallback reproduces the old
// dark values exactly.
const ink = (alpha: number) => `hsl(0 0% var(--zf-ink-l, 100%) / ${alpha})`;

type SpecIssue = { path: PropertyKey[]; message: string };
type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "unparsable"; message: string }
  | { status: "invalid"; issues: SpecIssue[] }
  | { status: "ready"; spec: DashboardSpec };

/**
 * The file was served but is not JSON at all — a trailing comma, a truncated
 * write, a half-saved edit. Carried as its own error type so the screen names
 * the syntax problem instead of sending the reader after the server, which is
 * where "make sure you're running `zframes serve`" used to point them.
 */
class SpecSyntaxError extends Error {}

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

// The file arrived but isn't JSON. Deliberately says nothing about `zframes
// serve`: the server answered, so pointing at it is the wrong problem — the
// only thing to fix is the syntax the parser choked on.
function SpecSyntaxScreen({ message }: { message: string }) {
  return (
    <Centered>
      <h1 className="font-dmsans text-strong mb-2 text-lg font-extrabold">
        dashboard.json is not valid JSON
      </h1>
      <p className="body-sm text-soft mb-4">
        The runtime read <code>dashboard.json</code> but couldn&rsquo;t parse
        it. Fix the syntax below (a trailing comma or an unclosed bracket is the
        usual cause), then reload.
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

// A refused write explains itself in the response body: the write route answers
// 400 with { error, issues } for a spec the schema rejected, and a bare status
// for the transport-level refusals (405 wrong method, 413 too large, 415 wrong
// content-type). Fold whichever arrived into one line, because that line is the
// only path by which the server's reason reaches the human — it used to reach
// the console and nowhere else.
const MAX_REASON_CHARS = 300;

async function writeFailureReason(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  let reason = raw.trim();
  try {
    const body = JSON.parse(raw) as { error?: unknown; issues?: unknown };
    const parts = [
      typeof body.error === "string" ? body.error : "",
      // The first few field paths; a spec can fail on dozens and the pill has
      // one line. `zframes lint` prints the full set.
      ...(Array.isArray(body.issues)
        ? body.issues.slice(0, 3).map(String)
        : []),
    ].filter(Boolean);
    if (parts.length > 0) reason = parts.join(" — ");
  } catch {
    // Not JSON (405/413/415 send no body at all) — keep whatever text arrived.
  }
  return reason.slice(0, MAX_REASON_CHARS);
}

/**
 * PUT the spec to the runtime's write-back endpoint (the @zframes/vite/vite
 * plugin in dev, the `zframes serve` http server in prod).
 *
 * THROWS on anything but a 2xx, and that is the contract: the editor awaits
 * this promise and only leaves customise mode + re-bases its history when it
 * fulfils, so swallowing a failure presented a refused write as a completed one
 * and discarded the very state that would have recovered the file. The thrown
 * message is what the editor renders in its save-failure pill.
 */
async function writeSpec(next: DashboardSpec): Promise<void> {
  let res: Response;
  try {
    res = await fetch(DASHBOARD_WRITE_ROUTE, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
  } catch (error) {
    // A rejected fetch means nothing answered — a stopped server or a dropped
    // connection, never a refused spec, so this is the one case where pointing
    // at `zframes serve` is the right advice.
    console.error("zframes: failed to save dashboard.json", error);
    throw new Error(
      "Couldn't reach the write-back endpoint — is `zframes serve` still running?",
      { cause: error },
    );
  }
  if (!res.ok) {
    const reason = await writeFailureReason(res);
    console.error(
      `zframes: failed to save dashboard.json (HTTP ${res.status})`,
      reason,
    );
    throw new Error(
      `Save refused (HTTP ${res.status})${reason ? `: ${reason}` : "."}`,
    );
  }
}

// The editor's Save. On success we reload so the editor re-renders from the
// file it just wrote — the round-trip is the proof. On failure the error
// propagates: the editor stays in customise mode with the board still dirty and
// the reason in its pill (and its "Export JSON" stays as a manual escape
// hatch). No alert: a native dialog can't say which field was refused, and it
// used to be dismissed after the mode had already closed behind it.
async function persist(next: DashboardSpec): Promise<void> {
  await writeSpec(next);
  window.location.reload();
}

// The editor's autosave: the same write, quietly. No reload (it would throw
// away the session mid-edit) and no dialog — a change the user never asked to
// save must not interrupt them. Rejects like `persist` so the editor can log it
// and keep the board dirty.
async function autoSave(next: DashboardSpec): Promise<void> {
  await writeSpec(next);
}

export default function App() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  // The mounted data providers, loaded per the server's providers route (see
  // the module-scope note). Null until resolved; the board renders only once
  // both the spec and the providers are in, so no frame ever mounts with an
  // empty provider list and flashes "No data source".
  const [runtime, setRuntime] = useState<RuntimeProviders | null>(null);
  const [customiseButtonTarget, setCustomiseButtonTarget] =
    useState<HTMLDivElement | null>(null);
  // Every cosmetic the editor reports while customising, in ONE object (null =
  // not editing → fall back to the saved spec). Held here, above the editor,
  // because all of it paints chrome the editor does not own: the page header and
  // the :root-scoped chart tokens (accent hue + saturation), the root font size
  // (chart text is rem-based, so nothing else scales it), the ticker tape's
  // --zf-up/--zf-down, the full-bleed backdrop, and its dark/light surface. This
  // was six separate mirrors fed by six separate callbacks, so a seventh knob
  // meant a seventh pair — and a host wiring five of them looked like a host
  // wiring all six.
  const [live, setLive] = useState<LiveCosmetics | null>(null);
  // Live layout mode the editor reports while customising (null = not editing →
  // fall back to the saved spec value). flow-horizontal is full-bleed, so the
  // host's centred max-width has to drop — and that decision lives here, on
  // <main>, above the editor.
  const [liveMode, setLiveMode] = useState<
    DashboardSpec["grid"]["mode"] | null
  >(null);
  // Whether the editor holds edits that aren't on disk. Held here because the
  // host chrome outside the editor can discard them: the dashboard chooser
  // reloads the page on a switch, and it must ask first.
  const [editorDirty, setEditorDirty] = useState(false);
  // Editing stays a desktop activity: only >=1024px gets the editable GridStack
  // editor. Phones and tablets get the read-only CSS-grid renderer, which
  // reflows itself (single column <=640px, two columns 641-1023px).
  const isDesktop = useIsDesktop();
  // FRAME_CSS only side-scrolls flow-horizontal boards above the phone
  // breakpoint (<=640px falls back to the vertical single-column stack), so the
  // host must not clamp <main> to a non-scrolling 100dvh there — that clipped
  // everything below the first viewport.
  const isWide = useMediaQuery("(min-width: 641px)");
  // Lifted from the zAI orb: when the orb is open, the background recolors +
  // brightens so opening zAI visibly "charges" the scene behind the dashboard.
  const [orbOpen, setOrbOpen] = useState(false);
  // Also lifted from the orb: while zAI is *thinking* (busy answering), the
  // background comes alive — it cycles its hue and breathes (see background.tsx).
  const [orbThinking, setOrbThinking] = useState(false);

  // The live edit wins while customising, else the saved spec — one resolution
  // for every token below, so none of them can be left on the stale half.
  const saved = load.status === "ready" ? load.spec : null;
  const accentHue = (live ?? saved)?.theme.accentHue ?? null;
  const accentSat = (live ?? saved)?.theme.accentSat ?? null;
  const fontScale = (live ?? saved)?.typography.scale ?? null;
  const upColor = (live ?? saved)?.theme.upColor ?? null;
  const downColor = (live ?? saved)?.theme.downColor ?? null;
  const surface = (live ?? saved)?.theme.surface ?? null;
  // The editor only exists on desktop, and losing the gate unmounts it along
  // with its history — so its last dirty report must not outlive it, or the
  // chooser would keep warning about edits nothing is holding any more.
  const dirty = isDesktop && editorDirty;
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
  // theme.surface's ink + card-lightness vars, at the document root. The
  // renderer/editor set the same vars on the grid container, which is all the
  // cards need — but every piece of host chrome is a SIBLING of that container
  // (header, ticker tape) or a body portal (the chooser), so on a light board
  // they stayed near-white over a light backdrop. Publishing them here is what
  // lets any of that chrome tint itself with hsl(0 0% var(--zf-ink-l) / α).
  // Dark writes exactly the baked-in fallbacks, so it's a no-op.
  useEffect(() => {
    if (surface == null) return;
    for (const [name, value] of Object.entries(surfaceModeVars(surface)))
      document.documentElement.style.setProperty(name, value);
  }, [surface]);

  useEffect(() => {
    // Memoized module-wide (StrictMode's double-effect reuses the one
    // in-flight load, so providers — and their sockets — construct once); the
    // `cancelled` guard only stops the discarded run's setState.
    let cancelled = false;
    void resolveRuntimeProviders().then((resolved) => {
      if (!cancelled) setRuntime(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Fetch once on mount. StrictMode runs this twice in dev; the `cancelled`
    // guard makes the discarded first run a no-op (a GET is idempotent anyway).
    let cancelled = false;
    fetch(DASHBOARD_READ_ROUTE, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Parsed by hand rather than res.json() so a syntax error is
        // distinguishable from a transport one: both used to land on the same
        // screen, whose advice ("make sure you're running `zframes serve`") is
        // wrong for a file the server read out fine and JSON.parse rejected.
        const text = await res.text();
        try {
          return JSON.parse(text) as unknown;
        } catch (error) {
          throw new SpecSyntaxError(String(error));
        }
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
        setLoad(
          error instanceof SpecSyntaxError
            ? { status: "unparsable", message: error.message }
            : { status: "error", message: String(error) },
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The spec is parsed before anything renders, so the exact set of frame chunks
  // this board needs is known up front — warm them (and the editor chunk) at idle
  // instead of waiting for each card to scroll into view. Best-effort: every
  // failure is swallowed, the render path retries on its own.
  useEffect(() => {
    if (load.status !== "ready") return;
    const names = new Set<string>();
    for (const instance of load.spec.frames) {
      names.add(instance.frame);
      for (const child of instance.children ?? []) names.add(child.frame);
    }
    return prefetchIdle(() => {
      prefetchFrames(registry, names);
      if (isDesktop) void loadEditor().catch(() => {});
    });
  }, [load, isDesktop]);

  if (load.status === "loading") return <Splash />;
  if (load.status === "error") return <LoadError message={load.message} />;
  if (load.status === "unparsable")
    return <SpecSyntaxScreen message={load.message} />;
  if (load.status === "invalid") return <SpecError issues={load.issues} />;
  if (!runtime) return <Splash />;
  const spec = load.spec;
  // flow-horizontal is full-bleed: it drops the centred max-width so the board
  // uses the whole viewport width and scrolls sideways. liveMode wins while
  // customising; otherwise the saved spec decides.
  const isHorizontal =
    (liveMode ?? spec.grid.mode) === "flow-horizontal" && isWide;
  // The live edit wins while customising, else the saved spec. Resolve the
  // backdrop's authored hue from its projectId so the accent hue-rotate spins
  // the scene relative to its own colour — a preset's paired scene renders as
  // authored, a rolled accent drifts it from there.
  const background = live?.background ?? spec.background;
  // The demo disclosure, in three cases because the advice differs: nothing
  // installed (the product's own default), the demo installed on purpose as the
  // only source, and the demo co-mounted with live plugins — where only the
  // capabilities no live provider covers are generated, and the fix is to
  // remove it rather than to add keyless. Any synthetic plugin at all is
  // disclosed: a market dashboard must never pass generated numbers off as
  // live, and "all mounted plugins are synthetic" used to be the bar.
  const demo =
    runtime.synthetic === "none"
      ? null
      : runtime.synthetic === "some"
        ? {
            label: "demo data mixed in",
            detail: `Demo data is mounted alongside live providers — every reading no live provider covers is generated. Run \`zframes providers remove ${runtime.syntheticPlugins.join(" ")}\` to drop it.`,
          }
        : {
            label: "demo data",
            detail: runtime.demoFallback
              ? "No data providers installed — every number on this board is generated demo data. Run `zframes providers add keyless` to connect free live market data."
              : "Demo data is the only data source installed — every number on this board is generated. Run `zframes providers add keyless` to connect free live market data.",
          };

  return (
    <FramesProvider providers={runtime.providers}>
      <DashboardBackground
        background={background}
        surface={live?.theme.surface ?? spec.theme.surface}
        active={orbOpen}
        thinking={orbThinking}
        accentHue={accentHue ?? spec.theme.accentHue}
        accentSat={accentSat ?? spec.theme.accentSat}
        sceneHue={sceneBaseHue(background.projectId)}
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
        {/* role="banner": a <header> inside <main> is NOT a banner landmark, so
            screen-reader landmark navigation had no way to reach the page's own
            chrome. Kept inside <main> because the entrance animation selector
            (main > header, styles.css) is what makes it lead the frame cascade. */}
        <header
          role="banner"
          className={`mb-5 flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-center lg:pr-28 ${
            isHorizontal ? "px-4 sm:px-6" : ""
          }`}
          style={{ borderBottomColor: ink(0.06) }}
        >
          <div className="flex min-w-0 flex-wrap items-baseline gap-3">
            <h1
              className="font-dmsans text-lg font-extrabold tracking-tight"
              style={{ color: ink(0.95) }}
            >
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
            <DashboardChooser currentTitle={spec.title} dirty={dirty} />
            <span
              className="caption rounded-full border px-1.5 py-0.5 font-mono leading-none"
              style={{ color: ink(0.6), borderColor: ink(0.08) }}
              title="zframes runtime version"
            >
              {/* The title attribute is pointer-only, so the pill announced as
                  a bare version string. The visually-hidden copy is what a
                  screen reader gets instead. */}
              <span className="sr-only">zframes runtime version </span>v
              {__ZFRAMES_VERSION__}
            </span>
            {demo && (
              <span
                className={`caption rounded-full border border-amber-300/30 px-1.5 py-0.5 font-mono leading-none ${
                  // Amber on amber-tinted glass reads on a dark board and
                  // disappears on a light one, so the ink flips with the surface.
                  surface === "light"
                    ? "bg-amber-400/20 text-amber-800"
                    : "bg-amber-400/10 text-amber-200/90"
                }`}
                title={demo.detail}
              >
                {demo.label}
                {/* Same pointer-only problem as the version pill, and this one
                    carries the whole disclosure plus the command that fixes it. */}
                <span className="sr-only"> — {demo.detail}</span>
              </span>
            )}
          </div>
        </header>
        <div
          ref={setCustomiseButtonTarget}
          className="pointer-events-none fixed right-4 top-4 z-40 flex min-h-10 items-center justify-end sm:right-6 sm:top-5"
        />
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
              onAutoSave={autoSave}
              onDirtyChange={setEditorDirty}
              customiseButtonTarget={customiseButtonTarget}
              onModeChange={setLiveMode}
              onLiveChange={setLive}
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
        // The header badge is not visible inside the answer the user is
        // reading, so the digest has to say the readings are simulated too —
        // otherwise zAI analyses generated prices as a market.
        synthetic={runtime.synthetic !== "none"}
      />
    </FramesProvider>
  );
}
