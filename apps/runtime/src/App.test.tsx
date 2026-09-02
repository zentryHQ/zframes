// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useProviders } from "@zframes/core";
import type { DashboardSpec, MarketDataProvider } from "@zframes/core";
import {
  DASHBOARD_LIST_ROUTE,
  DASHBOARD_READ_ROUTE,
  DASHBOARD_SWITCH_ROUTE,
  DASHBOARD_WRITE_ROUTE,
} from "@zframes/spec/routes";
import type { LiveCosmetics } from "@zframes/editor/editor";
import App from "./App";
import { DESKTOP_QUERY } from "./use-is-desktop";

// App.tsx is the runtime's composition root and the one file in the app with
// real integration risk: it FETCHES dashboard.json at runtime (the spec is never
// compiled in), validates it, composes the provider fleet, hosts the editor, and
// owns the save → PUT → reload round-trip that is the only path by which a human
// edit reaches the user's file. What's covered here:
//
//   * the load state machine — splash → ready / read-error / schema-invalid, and
//     the `cache: "no-store"` on the read (a cached spec means a save is followed
//     by a reload that re-renders the PRE-save file);
//   * provider mounting — the providers arrive from the plugin loader
//     (@zframes/plugins/load, mocked) in server order, since capability routing
//     is first-match with no dedup — and the all-synthetic mount badges the
//     header with "demo data";
//   * `persist` — the PUT carries the spec the editor emitted (not the loaded
//     one), and the reload fires ONLY on a 2xx: reloading after a failed write
//     silently discards the human's edits. A refused write REJECTS, carrying the
//     server's own reason, because the editor only leaves customise mode and
//     re-bases its history when this promise fulfils;
//   * `onAutoSave` — the same PUT with no reload and no dialog, rejecting the
//     same way so the editor can keep the board dirty;
//   * the live cosmetic knobs the editor reports, which App mirrors onto :root
//     for host chrome that lives OUTSIDE the dashboard container (ticker tape,
//     backdrop) — plus the full-bleed backdrop it repaints itself;
//   * the desktop gate — below 1024px the editor must never mount.
//
// Real in these tests: App, the spec schema + its defaults, DashboardRenderer,
// the real frame registry (lazy chunks and all), DashboardBackground and the
// ticker tape. Stubbed: the zAI orb (only the props App feeds it are asserted
// here), the GridStack editor (it owns per-item React
// roots and has its own suite in packages/editor/src/editor.test.tsx — App's
// contract with it is props-in / callbacks-out) and the plugin loader (the real
// one fetches the providers route and dynamic-imports plugin chunks — the
// Hyperliquid provider inside would open a live WebSocket — and the
// identity/order of the provider list is exactly what's asserted here).
//
// Two jsdom facts this file depends on, learned the hard way:
//   1. vitest's jsdom environment aliases `window` to `globalThis`, so
//      `vi.stubGlobal("location", …)` DOES replace `window.location` — the only
//      way to observe `window.location.reload()`, since jsdom's own Location is
//      [LegacyUnforgeable] (its `reload` is non-writable AND non-configurable, so
//      neither assignment nor `vi.spyOn` can touch it).
//   2. jsdom provides no `window.matchMedia`, so `useIsDesktop` throws without a
//      stub. Stubbing it is also how the desktop/mobile branch is chosen.

type EditorProps = Parameters<
  typeof import("@zframes/editor/editor").DashboardEditor
>[0];

const { editor, orb, PROVIDER_NAMES, pluginLoad } = vi.hoisted(() => ({
  editor: {
    props: null as EditorProps | null,
    providerNames: "",
  },
  // Typed loosely on purpose: what's asserted here is the ONE prop App feeds
  // it (the synthetic disclosure), and the orb's own contract has its own file.
  orb: { props: null as null | { synthetic?: boolean } },
  // Several entries so "the server's order is preserved" can't pass by
  // accident on a single-element list.
  PROVIDER_NAMES: ["keyless-first", "keyless-second", "binance", "wallet"],
  // Per-test override for what the (mocked) plugin loader resolves; null →
  // the default live-looking mount built from PROVIDER_NAMES.
  pluginLoad: {
    result: null as null | {
      providers: unknown[];
      synthetic: "all" | "some" | "none";
      syntheticPlugins: string[];
      demoFallback: boolean;
    },
  },
}));

/** Stands in for the GridStack editor: records the props App hands it, reports
 *  the providers visible from inside App's FramesProvider, and lets a test fire
 *  the editor's callbacks (onSave, the live cosmetic reports) directly. */
function EditorStub(props: EditorProps) {
  editor.props = props;
  editor.providerNames = useProviders()
    .map((p) => p.name)
    .join(",");
  return <div data-testid="editor" data-spec-title={props.spec.title} />;
}

vi.mock("@zframes/editor/editor", () => ({ DashboardEditor: EditorStub }));

// The orb is stubbed to the props App hands it: it owns a WebGL scene, a
// suggestion cycle and its own route probes, none of which this file is about.
vi.mock("./zai-orb", () => ({
  ZaiOrb: (props: { synthetic?: boolean }) => {
    orb.props = props;
    return null;
  },
}));

// Inert stand-in: a mock factory runs at App's import, before the module body,
// so it may only reference `vi.hoisted` values (and types, which are erased).
// App calls this at module scope AND in an effect; the real one is memoized, so
// the stub resolving fresh objects per call is strictly harsher than reality.
vi.mock("@zframes/plugins/load", () => ({
  resolveRuntimeProviders: async () =>
    pluginLoad.result ?? {
      providers: PROVIDER_NAMES.map(
        (name) => ({ name, capabilities: [] }) as unknown,
      ) as MarketDataProvider[],
      synthetic: "none",
      syntheticPlugins: [],
      demoFallback: false,
    },
}));

/** A raw dashboard.json body — deliberately minimal so the assertions below can
 *  tell the SCHEMA's defaults apart from anything the app made up. */
function specJson(over: Record<string, unknown> = {}) {
  return { title: "test board", frames: [], ...over };
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

interface Call {
  url: string;
  init: RequestInit | undefined;
}

let calls: Call[];
let readReply: () => Promise<Response>;
let writeReply: () => Promise<Response>;
let listReply: () => Promise<Response>;
let reload: ReturnType<typeof vi.fn>;
let alerts: ReturnType<typeof vi.fn>;
let confirms: ReturnType<typeof vi.fn>;
/** Silenced so the expected failure paths don't spam the run — and asserted on,
 *  since "surface the failure" is part of persist's contract. */
const spyOnConsoleError = () =>
  vi.spyOn(console, "error").mockImplementation(() => {});
let consoleError: ReturnType<typeof spyOnConsoleError>;
let desktop: boolean;

const routeCalls = (route: string) => calls.filter((c) => c.url === route);

beforeEach(() => {
  calls = [];
  desktop = true;
  readReply = async () => jsonResponse(specJson());
  writeReply = async () => jsonResponse({ ok: true });
  // 404 = "this server offers no chooser", which is the dev / explicit-path
  // case and keeps the header on its static title unless a test says otherwise.
  listReply = async () => new Response("not found", { status: 404 });
  reload = vi.fn();
  alerts = vi.fn();
  confirms = vi.fn(() => false);
  consoleError = spyOnConsoleError();

  vi.stubGlobal("__ZFRAMES_VERSION__", "9.9.9-test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === DASHBOARD_READ_ROUTE) return readReply();
      if (url === DASHBOARD_WRITE_ROUTE) return writeReply();
      if (url === DASHBOARD_LIST_ROUTE) return listReply();
      // The dashboard chooser and the zAI orb probe their own routes on mount;
      // 404 is the real "not available under this server" answer both handle by
      // staying hidden, and it keeps the suite hermetic.
      return new Response("not found", { status: 404 });
    }),
  );
  // window === globalThis here, so this is what makes window.location.reload
  // observable (see the header note).
  vi.stubGlobal("location", { ...window.location, reload });
  vi.stubGlobal("alert", alerts);
  vi.stubGlobal("confirm", confirms);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === DESKTOP_QUERY ? desktop : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

  editor.props = null;
  editor.providerNames = "";
  orb.props = null;
  pluginLoad.result = null;
  // App writes the live cosmetic tokens onto <html>, which outlives cleanup().
  document.documentElement.removeAttribute("style");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("style");
});

/** Render App and wait for the committed board (i.e. a resolved, valid spec).
 *  The wait is on the DOM — not on `editor.props`, which a discarded concurrent
 *  render can set before React commits — and generous, because the editor
 *  arrives through React.lazy. */
async function mountBoard() {
  const view = render(<App />);
  await screen.findByTestId("editor", undefined, { timeout: 5000 });
  return view;
}

/** The single spec the editor was handed. */
function editorSpec(): DashboardSpec {
  if (!editor.props) throw new Error("the editor never mounted");
  return editor.props.spec;
}

/**
 * The cosmetic half of the spec the editor was handed, with an override applied
 * — the exact shape the editor reports through `onLiveChange`. The editor sends
 * the WHOLE cosmetic half on every change (one callback, not seven), so a test
 * that overrode only the field it cares about would be reporting a shape the
 * editor never emits.
 */
function liveCosmetics(over: Partial<LiveCosmetics> = {}): LiveCosmetics {
  const s = editorSpec();
  return {
    grid: s.grid,
    background: s.background,
    theme: s.theme,
    typography: s.typography,
    appearance: s.appearance,
    currency: s.currency,
    ...over,
  };
}

/** Fire one of the editor's callbacks the way the real editor would. */
async function fromEditor(run: (props: EditorProps) => unknown) {
  if (!editor.props) throw new Error("the editor never mounted");
  const props = editor.props;
  await act(async () => {
    await run(props);
  });
}

/** Same, for a callback that is expected to REJECT — returns the error, so a
 *  silently-fulfilling write path fails the test rather than passing it. */
async function rejectionFrom(
  run: (props: EditorProps) => unknown,
): Promise<Error> {
  try {
    await fromEditor(run);
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected the write to reject, but it resolved");
}

describe("loading dashboard.json", () => {
  it("reads the spec from the runtime's route, uncached, and renders it", async () => {
    readReply = async () => jsonResponse(specJson({ title: "my board" }));
    render(<App />);

    // First paint is the splash, not a blank screen.
    expect(screen.getByText(/loading dashboard/i)).toBeDefined();
    await screen.findByTestId("editor", undefined, { timeout: 5000 });

    expect(routeCalls(DASHBOARD_READ_ROUTE)).toHaveLength(1);
    // `no-store` is load-bearing: persist() reloads the page after a save, and a
    // cached GET would re-render the file as it was BEFORE the write.
    expect(routeCalls(DASHBOARD_READ_ROUTE)[0].init?.cache).toBe("no-store");

    // The title on screen came off the wire — the spec is not compiled in.
    expect(screen.getByText("my board")).toBeDefined();
    expect(screen.getByTestId("editor").dataset.specTitle).toBe("my board");
    // …and what reached the editor is the PARSED spec (schema defaults applied),
    // not the raw JSON: the payload above carried neither of these.
    expect(editorSpec().grid.columns).toBe(12);
    expect(editorSpec().version).toBe("1.0.0");
    // The runtime badges the CLI version it was built into — with what the
    // title says also in the accessible name, since a title is pointer-only.
    const pill = screen.getByTitle("zframes runtime version");
    expect(pill.textContent).toContain("v9.9.9-test");
    expect(pill.textContent).toContain("zframes runtime version");
  });

  it("shows the read error instead of a board when the route fails", async () => {
    readReply = async () => jsonResponse({ error: "nope" }, 503);
    render(<App />);

    const error = await screen.findByText(/couldn’t load your dashboard/i);
    expect(error).toBeDefined();
    // The status is surfaced verbatim — it's the first thing a user reports.
    expect(screen.getByText(/HTTP 503/)).toBeDefined();
    expect(screen.queryByTestId("editor")).toBeNull();
    expect(document.querySelector(".zf-grid")).toBeNull();
    expect(editor.props).toBeNull();
  });

  it("shows the read error when the fetch itself rejects", async () => {
    readReply = async () => {
      throw new TypeError("Failed to fetch");
    };
    render(<App />);

    expect(
      await screen.findByText(/couldn’t load your dashboard/i),
    ).toBeDefined();
    expect(screen.getByText(/Failed to fetch/)).toBeDefined();
    expect(screen.queryByTestId("editor")).toBeNull();
  });

  it("names the syntax problem — not the server — when the file isn't JSON", async () => {
    // A trailing comma is the everyday case, and the read-error screen's advice
    // ("make sure you're running `zframes serve`") points at the wrong problem:
    // the server answered fine.
    readReply = async () =>
      new Response('{ "title": "board", }', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    render(<App />);

    expect(
      await screen.findByText(/dashboard\.json is not valid JSON/i),
    ).toBeDefined();
    expect(screen.queryByText(/couldn’t load your dashboard/i)).toBeNull();
    // No "is the server running" advice on a file the server read out fine.
    expect(document.body.textContent).not.toMatch(/zframes serve/);
    // The parser's own complaint is shown, so the reader knows where to look.
    expect(document.body.textContent).toMatch(/JSON/);
    expect(editor.props).toBeNull();
  });

  it("lists the schema issues when the file is not a valid spec", async () => {
    // No `title` (the one field with no default) and a frame missing its
    // position — a top-level shape error, which renders here rather than as a
    // per-frame error card.
    readReply = async () =>
      jsonResponse({ frames: [{ id: "a", frame: "note" }] });
    render(<App />);

    expect(
      await screen.findByText(/dashboard\.json is not a valid spec/i),
    ).toBeDefined();
    const issues = [...document.querySelectorAll("li")].map(
      (li) => li.textContent ?? "",
    );
    expect(issues.some((t) => t.startsWith("title:"))).toBe(true);
    expect(issues.some((t) => t.startsWith("frames.0.position:"))).toBe(true);
    // An invalid spec must not reach the editor at all — the editor would write
    // whatever it was handed straight back to the user's file.
    expect(editor.props).toBeNull();
    expect(document.querySelector(".zf-grid")).toBeNull();
  });
});

describe("provider mounting", () => {
  it("hands the loader's providers to the frames, preserving server order", async () => {
    await mountBoard();
    // Order is load-bearing: useProviderFor is first-match with no dedup, and
    // mount order is the operator's routing precedence.
    expect(editor.providerNames).toBe(PROVIDER_NAMES.join(","));
  });

  /** The header's demo badge, or null. */
  const badge = () =>
    document.querySelector<HTMLElement>("header [title*='demo' i]");

  it("badges the header when everything mounted is synthetic", async () => {
    pluginLoad.result = {
      providers: [{ name: "mock", capabilities: [] }],
      synthetic: "all",
      syntheticPlugins: ["demo"],
      demoFallback: true,
    };
    await mountBoard();
    // The demo fallback must be visibly labelled — generated numbers on a
    // market dashboard are never allowed to pass as live data.
    expect(badge()?.textContent).toContain("demo data");
    expect(badge()?.title).toMatch(/No data providers installed/);
    // The title is pointer-only, so the same disclosure has to be in the text.
    expect(badge()?.textContent).toMatch(/providers add keyless/);
    expect(editor.providerNames).toBe("mock");
  });

  it("does not blame an empty install when the demo was installed on purpose", async () => {
    pluginLoad.result = {
      providers: [{ name: "mock", capabilities: [] }],
      synthetic: "all",
      syntheticPlugins: ["demo"],
      demoFallback: false,
    };
    await mountBoard();
    expect(badge()?.title).not.toMatch(/No data providers installed/);
    expect(badge()?.title).toMatch(/only data source installed/);
  });

  it("badges a mixed mount, naming the plugin to remove", async () => {
    pluginLoad.result = {
      providers: [{ name: "live", capabilities: [] }],
      synthetic: "some",
      syntheticPlugins: ["demo"],
      demoFallback: false,
    };
    await mountBoard();
    // One real plugin must not clear the disclosure: the demo still serves
    // every capability the live plugins don't cover.
    expect(badge()?.textContent).toContain("demo data mixed in");
    expect(badge()?.title).toMatch(/zframes providers remove demo/);
  });

  it("shows no demo badge on a live mount", async () => {
    await mountBoard();
    expect(badge()).toBeNull();
  });

  it("tells the orb when any mounted provider is synthetic", async () => {
    // The header badge isn't visible in the answer the user is reading, so the
    // digest has to carry the same disclosure.
    pluginLoad.result = {
      providers: [{ name: "live", capabilities: [] }],
      synthetic: "some",
      syntheticPlugins: ["demo"],
      demoFallback: false,
    };
    await mountBoard();
    expect(orb.props?.synthetic).toBe(true);
  });

  it("tells the orb nothing is synthetic on a live mount", async () => {
    await mountBoard();
    expect(orb.props?.synthetic).toBe(false);
  });
});

describe("saving the edited spec back to dashboard.json", () => {
  /** The spec as the editor would emit it after a human edit. */
  function editedSpec(): DashboardSpec {
    return { ...editorSpec(), title: "edited by hand" };
  }

  it("PUTs the editor's spec to the write route and reloads on success", async () => {
    await mountBoard();
    const next = editedSpec();
    await fromEditor((props) => props.onSave?.(next));

    const writes = routeCalls(DASHBOARD_WRITE_ROUTE);
    expect(writes).toHaveLength(1);
    expect(writes[0].init?.method).toBe("PUT");
    expect(writes[0].init?.headers).toEqual({
      "content-type": "application/json",
    });
    // The body is the spec the editor EMITTED, not the one that was loaded —
    // sending the loaded spec would throw the human's edit away silently.
    const sent = JSON.parse(String(writes[0].init?.body));
    expect(sent).toEqual(next);
    expect(sent.title).toBe("edited by hand");
    // Reload so the editor re-renders from the file it just wrote.
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("REJECTS with the server's reason — and does not reload — when the write is refused", async () => {
    await mountBoard();
    writeReply = async () => jsonResponse({ error: "read-only" }, 500);

    // Rejecting is the contract: the editor leaves customise mode and re-bases
    // its history only when this promise FULFILS, so a swallowed failure
    // presented a refused write as a completed one and threw away the state
    // that would have recovered the file.
    const failure = await rejectionFrom((props) =>
      props.onSave?.(editedSpec()),
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toContain("HTTP 500");
    expect(failure.message).toContain("read-only");

    expect(routeCalls(DASHBOARD_WRITE_ROUTE)).toHaveLength(1);
    // A reload here would discard the unsaved edits the user can still retry.
    expect(reload).not.toHaveBeenCalled();
    // No native dialog: it can't say which field was refused, and it used to be
    // dismissed after customise mode had already closed behind it.
    expect(alerts).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    // Still the live board (with the editor mounted), not an error screen.
    expect(screen.getByTestId("editor")).toBeDefined();
  });

  it("carries the refused spec's field paths into the message", async () => {
    await mountBoard();
    // What the write route actually answers for a spec the schema rejects.
    writeReply = async () =>
      jsonResponse(
        {
          ok: false,
          error: "not a valid dashboard spec — nothing was written",
          issues: ["frames.0.position: Required"],
        },
        400,
      );

    const failure = await rejectionFrom((props) =>
      props.onSave?.(editedSpec()),
    );
    // The per-field explanation used to reach the console and nowhere else.
    expect(failure.message).toContain("nothing was written");
    expect(failure.message).toContain("frames.0.position");
  });

  it("blames the server only when the fetch itself never landed", async () => {
    await mountBoard();
    writeReply = async () => {
      throw new TypeError("Failed to fetch");
    };

    const failure = await rejectionFrom((props) =>
      props.onSave?.(editedSpec()),
    );
    expect(failure.message).toContain("zframes serve");
    expect(reload).not.toHaveBeenCalled();
    expect(alerts).not.toHaveBeenCalled();
    expect(screen.getByTestId("editor")).toBeDefined();
  });

  it("autosaves quietly: same PUT, no reload, no dialog", async () => {
    await mountBoard();
    const next = editedSpec();
    await fromEditor((props) => props.onAutoSave?.(next));

    const writes = routeCalls(DASHBOARD_WRITE_ROUTE);
    expect(writes).toHaveLength(1);
    expect(writes[0].init?.method).toBe("PUT");
    expect(JSON.parse(String(writes[0].init?.body))).toEqual(next);
    // An autosave the user never asked for must not reload the page out from
    // under them mid-edit, nor interrupt them with a dialog.
    expect(reload).not.toHaveBeenCalled();
    expect(alerts).not.toHaveBeenCalled();
  });

  it("rejects a failed autosave so the editor can keep the board dirty", async () => {
    await mountBoard();
    writeReply = async () => jsonResponse({ error: "read-only" }, 500);

    const failure = await rejectionFrom((props) =>
      props.onAutoSave?.(editedSpec()),
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toContain("HTTP 500");
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("live cosmetics the editor reports", () => {
  const root = () => document.documentElement;

  it("mirrors the saved spec's tokens onto :root, then the editor's live values", async () => {
    readReply = async () =>
      jsonResponse(
        specJson({
          theme: {
            accentHue: 200,
            accentSat: 55,
            upColor: "#00ff00",
            downColor: "#ff0000",
          },
          typography: { scale: 1.25 },
        }),
      );
    await mountBoard();

    // :root carries the SAVED values first — the in-grid frames read the
    // container's vars, but host chrome outside it (ticker tape, chart tokens)
    // only follows if App pushes them here.
    expect(root().style.getPropertyValue("--zf-accent-hue")).toBe("200");
    expect(root().style.getPropertyValue("--zf-accent-sat")).toBe("55%");
    expect(root().style.getPropertyValue("--zf-up")).toBe("#00ff00");
    expect(root().style.getPropertyValue("--zf-down")).toBe("#ff0000");
    // typography.scale rides the root font size; rem-based chart text and titles
    // scale with nothing else.
    expect(root().style.fontSize).toBe("125%");

    await fromEditor((props) =>
      props.onLiveChange?.(
        liveCosmetics({
          theme: {
            ...editorSpec().theme,
            accentHue: 40,
            accentSat: 10,
            upColor: "#111111",
            downColor: "#222222",
          },
          typography: { ...editorSpec().typography, scale: 0.9 },
        }),
      ),
    );

    // The live report wins over the saved spec while customising, so the header
    // and the tape re-tint with the slider instead of only after a save.
    expect(root().style.getPropertyValue("--zf-accent-hue")).toBe("40");
    expect(root().style.getPropertyValue("--zf-accent-sat")).toBe("10%");
    expect(root().style.getPropertyValue("--zf-up")).toBe("#111111");
    expect(root().style.getPropertyValue("--zf-down")).toBe("#222222");
    expect(root().style.fontSize).toBe("90%");
  });

  it("publishes the surface mode's ink tokens at the document root", async () => {
    readReply = async () => jsonResponse(specJson({ theme: {} }));
    await mountBoard();

    // Dark writes the baked-in fallbacks, so the shell is unchanged…
    expect(root().style.getPropertyValue("--zf-ink-l")).toBe("100%");
    expect(root().style.getPropertyValue("--zf-surf-l3")).toBe("5.3%");

    await fromEditor((props) =>
      props.onLiveChange?.(
        liveCosmetics({ theme: { ...editorSpec().theme, surface: "light" } }),
      ),
    );

    // …and light flips them here, which is the ONLY way host chrome outside the
    // grid container (header, ticker tape, the portaled chooser) can follow the
    // surface at all: the renderer sets these on the container, not the root.
    expect(root().style.getPropertyValue("--zf-ink-l")).toBe("16%");
    expect(root().style.getPropertyValue("--zf-surf-l1")).toBe("98%");
  });

  it("falls back to the saved values the moment the editor reports null", async () => {
    readReply = async () =>
      jsonResponse(specJson({ theme: { accentHue: 200 } }));
    await mountBoard();

    await fromEditor((props) =>
      props.onLiveChange?.(
        liveCosmetics({
          theme: { ...editorSpec().theme, accentHue: 40, surface: "light" },
        }),
      ),
    );
    expect(root().style.getPropertyValue("--zf-accent-hue")).toBe("40");

    // The editor reports null when it unmounts (e.g. the desktop gate is lost
    // mid-session), which used to strand the whole page on the abandoned
    // edit's cosmetics until a reload.
    await fromEditor((props) => props.onLiveChange?.(null));
    expect(root().style.getPropertyValue("--zf-accent-hue")).toBe("200");
    expect(root().style.getPropertyValue("--zf-ink-l")).toBe("100%");
  });

  it("repaints the full-bleed backdrop it owns when the editor reports one", async () => {
    readReply = async () =>
      jsonResponse(
        specJson({ background: { type: "color", color: "#123456" } }),
      );
    const { container } = await mountBoard();

    // The backdrop renders OUTSIDE the editor (App owns it), which is why the
    // live value has to be held above the editor to preview at all.
    const fill = () => container.querySelector<HTMLElement>("[aria-hidden]");
    expect(fill()?.style.backgroundColor).toBe("rgb(18, 52, 86)");

    await fromEditor((props) =>
      props.onLiveChange?.(
        liveCosmetics({
          background: {
            ...editorSpec().background,
            type: "color",
            color: "#654321",
          },
        }),
      ),
    );
    expect(fill()?.style.backgroundColor).toBe("rgb(101, 67, 33)");
  });
});

describe("unsaved edits and the dashboard switch", () => {
  /** A server that offers a chooser with two switchable dashboards. */
  function twoDashboards() {
    listReply = async () =>
      jsonResponse({
        current: "a",
        canSwitch: true,
        dashboards: [
          { name: "a", title: "board a", isDefault: true },
          { name: "b", title: "board b", isDefault: false },
        ],
      });
  }

  /** Open the chooser and click the OTHER dashboard's card. */
  async function switchToB() {
    fireEvent.click(await screen.findByRole("button", { name: /test board/ }));
    await act(async () => {
      fireEvent.click(screen.getByText("board b"));
    });
  }

  it("asks before a switch discards unsaved edits, and stays put on cancel", async () => {
    twoDashboards();
    await mountBoard();
    await fromEditor((props) => props.onDirtyChange?.(true));
    confirms.mockReturnValue(false);

    await switchToB();

    // The switch reloads the page, which discards the session with no draft and
    // no way back — declining must leave the board exactly where it was.
    expect(confirms).toHaveBeenCalledTimes(1);
    expect(routeCalls(DASHBOARD_SWITCH_ROUTE)).toHaveLength(0);
    expect(reload).not.toHaveBeenCalled();
  });

  it("switches without asking when the board is clean", async () => {
    twoDashboards();
    await mountBoard();
    await switchToB();

    expect(confirms).not.toHaveBeenCalled();
    expect(routeCalls(DASHBOARD_SWITCH_ROUTE)).toHaveLength(1);
  });

  it("switches once the user accepts losing the edits", async () => {
    twoDashboards();
    await mountBoard();
    await fromEditor((props) => props.onDirtyChange?.(true));
    confirms.mockReturnValue(true);

    await switchToB();

    expect(confirms).toHaveBeenCalledTimes(1);
    expect(routeCalls(DASHBOARD_SWITCH_ROUTE)).toHaveLength(1);
  });
});

describe("the desktop gate", () => {
  it("renders the read-only board and never mounts the editor below 1024px", async () => {
    desktop = false;
    readReply = async () =>
      jsonResponse(
        specJson({
          frames: [
            {
              id: "n1",
              frame: "note",
              position: { x: 0, y: 0, w: 4, h: 3 },
              config: { text: "read-only board" },
            },
          ],
        }),
      );
    render(<App />);

    // A real frame out of the real registry, rendered through the real
    // DashboardRenderer — the phone/tablet path is not a stub.
    expect(
      await screen.findByText("read-only board", undefined, { timeout: 5000 }),
    ).toBeDefined();
    expect(document.querySelector(".zf-grid")).not.toBeNull();
    // The GridStack editor is desktop-only: it must not even be imported here.
    expect(screen.queryByTestId("editor")).toBeNull();
    expect(editor.props).toBeNull();
  });
});
