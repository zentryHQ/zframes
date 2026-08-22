// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useProviders } from "@zframes/core";
import type { DashboardSpec, MarketDataProvider } from "@zframes/core";
import {
  DASHBOARD_READ_ROUTE,
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
//   * provider composition — the keyless set with the keyed tier appended, in
//     order, since capability routing is first-match with no dedup;
//   * `persist` — the PUT carries the spec the editor emitted (not the loaded
//     one), and the reload fires ONLY on a 2xx: reloading after a failed write
//     silently discards the human's edits, so the failure branch has to keep them
//     on screen behind an alert;
//   * the live cosmetic knobs the editor reports, which App mirrors onto :root
//     for host chrome that lives OUTSIDE the dashboard container (ticker tape,
//     backdrop) — plus the full-bleed backdrop it repaints itself;
//   * the desktop gate — below 1024px the editor must never mount.
//
// Real in these tests: App, the spec schema + its defaults, DashboardRenderer,
// the real frame registry (lazy chunks and all), DashboardBackground, the ticker
// tape and the zAI orb. Stubbed: the GridStack editor (it owns per-item React
// roots and has its own suite in packages/editor/src/editor.test.tsx — App's
// contract with it is props-in / callbacks-out) and the provider fleet (the real
// Hyperliquid provider opens a live WebSocket, and the identity/order of the list
// is exactly what's asserted here).
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

const { editor, KEYLESS_NAMES } = vi.hoisted(() => ({
  editor: {
    props: null as EditorProps | null,
    providerNames: "",
  },
  // Two entries so "the keyed tier is appended" can't pass by accident on a
  // single-element list.
  KEYLESS_NAMES: ["keyless-first", "keyless-second"],
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

// Inert stand-ins: a mock factory runs at App's import, before the module body,
// so it may only reference `vi.hoisted` values (and types, which are erased).
vi.mock("@zframes/providers-keyless", () => ({
  createKeylessProviders: (): MarketDataProvider[] =>
    KEYLESS_NAMES.map((name) => ({ name, capabilities: [] })),
}));
vi.mock("@zframes/provider-binance", () => ({
  BinanceProvider: class {
    name = "binance";
    capabilities = [];
  },
}));
vi.mock("@zframes/provider-wallet", () => ({
  WalletProvider: class {
    name = "wallet";
    capabilities = [];
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
let reload: ReturnType<typeof vi.fn>;
let alerts: ReturnType<typeof vi.fn>;
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
  reload = vi.fn();
  alerts = vi.fn();
  consoleError = spyOnConsoleError();

  vi.stubGlobal("__ZFRAMES_VERSION__", "9.9.9-test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === DASHBOARD_READ_ROUTE) return readReply();
      if (url === DASHBOARD_WRITE_ROUTE) return writeReply();
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
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === DESKTOP_QUERY ? desktop : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

  editor.props = null;
  editor.providerNames = "";
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
    // The runtime badges the CLI version it was built into.
    expect(screen.getByTitle("zframes runtime version").textContent).toBe(
      "v9.9.9-test",
    );
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

describe("provider composition", () => {
  it("appends the keyed tier to the keyless set, in routing order", async () => {
    await mountBoard();
    // Order is load-bearing (useProviderFor is first-match, no dedup) and the
    // keyed tier belongs LAST, behind the keyless fleet the explorer also ships.
    expect(editor.providerNames).toBe(
      [...KEYLESS_NAMES, "binance", "wallet"].join(","),
    );
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

  it("keeps the edits on screen — and does NOT reload — when the write is rejected", async () => {
    await mountBoard();
    writeReply = async () => jsonResponse({ error: "read-only" }, 500);
    await fromEditor((props) => props.onSave?.(editedSpec()));

    expect(routeCalls(DASHBOARD_WRITE_ROUTE)).toHaveLength(1);
    // A reload here would discard the unsaved edits the user can still retry.
    expect(reload).not.toHaveBeenCalled();
    expect(alerts).toHaveBeenCalledTimes(1);
    expect(String(alerts.mock.calls[0][0])).toContain("zframes serve");
    expect(consoleError).toHaveBeenCalledWith(
      "zframes: failed to save dashboard.json",
      expect.any(Error),
    );
    // Still the live board (with the editor mounted), not an error screen.
    expect(screen.getByTestId("editor")).toBeDefined();
  });

  it("keeps the edits on screen when the write throws (server gone)", async () => {
    await mountBoard();
    writeReply = async () => {
      throw new TypeError("Failed to fetch");
    };
    await fromEditor((props) => props.onSave?.(editedSpec()));

    expect(reload).not.toHaveBeenCalled();
    expect(alerts).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("editor")).toBeDefined();
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
