// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { escapeLayerDepth } from "@zframes/core";
import { DASHBOARD_LIST_ROUTE } from "@zframes/spec/routes";
import { DashboardChooser } from "./dashboard-chooser";

// The chooser is the product's one hand-rolled modal — everything else
// dismissable goes through Radix — so its keyboard contract is written down
// here: focus moves into the panel, Tab stays inside it, closing hands focus
// back to the trigger, and Escape is claimed through the shared stack rather
// than a window listener of its own (two surfaces used to answer one press).

const listBody = {
  current: "a",
  canSwitch: true,
  dashboards: [
    { name: "a", title: "board a", isDefault: true },
    { name: "b", title: "board b", isDefault: false },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input) === DASHBOARD_LIST_ROUTE
        ? new Response(JSON.stringify(listBody), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        : new Response("not found", { status: 404 }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Render the chooser and wait for the list route to turn the title into a
 *  button (the server reporting canSwitch with more than one dashboard). */
async function mountChooser(dirty = false) {
  render(<DashboardChooser currentTitle="board a" dirty={dirty} />);
  return screen.findByRole("button", { name: /board a/ });
}

const panel = () => screen.getByRole("dialog");
/** Every stop Tab can reach inside the panel, in document order. */
const stops = () =>
  [...panel().querySelectorAll<HTMLButtonElement>("button")].filter(
    (el) => !el.disabled,
  );

describe("the dashboard chooser's modal keyboard contract", () => {
  it("falls back to a static title when the server offers no chooser", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    render(<DashboardChooser currentTitle="board a" />);
    // Nothing to choose between: no button, no dialog, no Escape layer.
    await act(async () => {});
    expect(screen.queryByRole("button")).toBeNull();
    expect(escapeLayerDepth()).toBe(0);
  });

  it("moves focus into the panel on open and back to the trigger on close", async () => {
    const trigger = await mountChooser();
    fireEvent.click(trigger);

    // The overlay claims aria-modal; focus has to follow it, or Tab walks the
    // page underneath the scrim.
    expect(document.activeElement).toBe(panel());

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("wraps Tab within the panel at both ends", async () => {
    fireEvent.click(await mountChooser());
    const inside = stops();
    expect(inside.length).toBeGreaterThan(1);
    const first = inside[0];
    const last = inside[inside.length - 1];

    // From the panel itself (the initial focus target) Shift+Tab wraps to the
    // last stop rather than escaping upwards into the page.
    fireEvent.keyDown(panel(), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(panel(), { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(panel(), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("registers exactly one Escape layer while open, and closes on the key", async () => {
    const trigger = await mountChooser();
    expect(escapeLayerDepth()).toBe(0);

    fireEvent.click(trigger);
    // One LAYER, not a window listener: with the orb also open, a single press
    // used to close both surfaces.
    expect(escapeLayerDepth()).toBe(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(escapeLayerDepth()).toBe(0);
    expect(document.activeElement).toBe(trigger);
  });

  it("asks before a switch discards unsaved edits", async () => {
    const confirms = vi.fn(() => false);
    vi.stubGlobal("confirm", confirms);
    fireEvent.click(await mountChooser(true));

    await act(async () => {
      fireEvent.click(screen.getByText("board b"));
    });

    expect(confirms).toHaveBeenCalledTimes(1);
    // Declining leaves the session alone: no switch POST, no reload.
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => String(url) !== DASHBOARD_LIST_ROUTE),
    ).toHaveLength(0);
  });
});
