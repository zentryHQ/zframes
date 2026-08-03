// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { z } from "zod";
import { FrameConfigDialog } from "./editor-config";
import { createRegistry, defineFrame } from "@zframes/spec/frame";
import type { FrameInstance } from "@zframes/spec/spec";

// The config dialog turns a frame's Zod schema into a form: each field shape maps
// to a specific control, and every edit is validated live against that schema —
// a valid draft is pushed to the shared instance (and re-renders the frame), an
// invalid one surfaces an error and is NOT committed. These tests drive the real
// FrameConfigDialog with fireEvent and assert both the control dispatch and the
// commit/validation gating (no GridStack involved).

// One synthetic frame whose schema exercises every control branch. Deliberately
// avoids the symbol/symbols/holdings keys so the ticker picker stays out of the
// way and configFields owns all of these.
const schema = z.object({
  enabled: z.boolean().default(true), // → checkbox
  mode: z.enum(["fast", "slow"]).default("fast"), // → <select>
  size: z.number().min(0).max(100).default(50), // → range slider (bounded)
  count: z.number().default(3), // → number input (open-ended, no min+max)
  color: z.string().default("#8b8df9"), // → color picker (key "color")
  text: z.string().default("hello"), // → textarea (key "text")
  label: z.string().min(3).default("Name"), // → text input (+ validated)
  tags: z.array(z.string()).max(3).default([]), // → tag list (maxItems 3)
});

const syntheticFrame = defineFrame({
  name: "synthetic",
  label: "Synthetic",
  category: "tools",
  description: "every control branch",
  capabilities: [],
  schema,
  component: () => null,
});

/** Same schema, but flagged as a time-axis chart — the Events panel's gate. */
const annotatableFrame = defineFrame({
  name: "synthetic-chart",
  label: "Synthetic Chart",
  category: "markets",
  description: "a time-axis chart that draws event markers",
  capabilities: [],
  annotatable: true,
  schema,
  component: () => null,
});

const registry = createRegistry([syntheticFrame, annotatableFrame]);

const baseConfig = {
  enabled: true,
  mode: "fast",
  size: 50,
  count: 3,
  color: "#8b8df9",
  text: "hello",
  label: "Name",
  tags: [] as string[],
};

function setup(
  configOverrides: Record<string, unknown> = {},
  instanceOverrides: Partial<FrameInstance> = {},
) {
  const instance: FrameInstance = {
    id: "f1",
    frame: "synthetic",
    position: { x: 0, y: 0, w: 2, h: 2 },
    config: { ...baseConfig, ...configOverrides },
    ...instanceOverrides,
  };
  const instancesRef = { current: new Map([[instance.id, instance]]) };
  const onApply = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <FrameConfigDialog
      instance={instance}
      registry={registry}
      instancesRef={instancesRef}
      symbolUniverse={{ options: [], loading: false }}
      accentHue={242}
      inherited={{
        accentHue: 242,
        accentSat: 90,
        baseHue: 233,
        baseSat: 20,
        surfaceOpacity: 1,
        radius: 18,
        borderStrength: 0.22,
        density: 1,
        elevation: 1,
      }}
      onApply={onApply}
      onClose={onClose}
    />,
  );
  const committed = () =>
    instancesRef.current.get("f1")!.config as Record<string, unknown>;
  const committedInstance = () => instancesRef.current.get("f1")!;
  return {
    ...view,
    instancesRef,
    onApply,
    onClose,
    committed,
    committedInstance,
  };
}

afterEach(() => cleanup());

describe("FrameConfigDialog control dispatch", () => {
  it("boolean → a checkbox that commits the toggled value", () => {
    const { container, onApply, committed } = setup();
    const checkbox = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(true); // reflects config.enabled

    fireEvent.click(checkbox);
    expect(committed().enabled).toBe(false);
    expect(onApply).toHaveBeenCalledWith("f1");
  });

  it("enum → a <select> of humanized options that commits the choice", () => {
    const { container, onApply, committed } = setup();
    const select = container.querySelector("#zf-cfg-mode") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    const options = [...select.options].map((o) => ({
      value: o.value,
      text: o.textContent,
    }));
    expect(options).toEqual([
      { value: "fast", text: "Fast" },
      { value: "slow", text: "Slow" },
    ]);
    expect(select.value).toBe("fast");

    fireEvent.change(select, { target: { value: "slow" } });
    expect(committed().mode).toBe("slow");
    expect(onApply).toHaveBeenCalledWith("f1");
  });

  it("bounded number → a range slider that commits + shows the live value", () => {
    const { container, committed } = setup();
    const range = container.querySelector("#zf-cfg-size") as HTMLInputElement;
    expect(range.type).toBe("range");
    expect(range.min).toBe("0");
    expect(range.max).toBe("100");

    fireEvent.change(range, { target: { value: "75" } });
    expect(committed().size).toBe(75);
    expect(container.querySelector(".zf-field-num")?.textContent).toBe("75");
  });

  it("open-ended number → a number input that commits a numeric value", () => {
    const { container, committed } = setup();
    const num = container.querySelector("#zf-cfg-count") as HTMLInputElement;
    expect(num.type).toBe("number");

    fireEvent.change(num, { target: { value: "7" } });
    expect(committed().count).toBe(7);
  });

  it('string key "color" → a color picker (swatch + text input)', () => {
    const { container } = setup();
    expect(container.querySelector('input[type="color"]')).not.toBeNull();
    const text = container.querySelector("#zf-cfg-color") as HTMLInputElement;
    expect(text.tagName).toBe("INPUT");
    expect(text.value).toBe("#8b8df9");
  });

  it('string key "text" → a textarea', () => {
    const { container } = setup();
    const el = container.querySelector("#zf-cfg-text");
    expect(el?.tagName).toBe("TEXTAREA");
  });

  it("plain string → a text input", () => {
    const { container } = setup();
    const el = container.querySelector("#zf-cfg-label") as HTMLInputElement;
    expect(el.tagName).toBe("INPUT");
    // Not the number/range/color variants.
    expect(el.type).toBe("text");
  });

  it("string[] → a tag list: adds (uppercased), caps at maxItems, removes", () => {
    const { container, committed } = setup();
    const tagInput = () =>
      container.querySelector("#zf-cfg-tags") as HTMLInputElement;

    const add = (raw: string) => {
      fireEvent.change(tagInput(), { target: { value: raw } });
      fireEvent.keyDown(tagInput(), { key: "Enter" });
    };

    add("btc");
    expect(committed().tags).toEqual(["BTC"]); // normalized to upper-case
    expect(
      container.querySelector('.zf-tag button[aria-label="Remove BTC"]'),
    ).not.toBeNull();

    add("eth");
    add("sol");
    expect(committed().tags).toEqual(["BTC", "ETH", "SOL"]);
    // maxItems (3) reached → the input disables so no 4th can be added.
    expect(tagInput().disabled).toBe(true);

    fireEvent.click(
      container.querySelector('button[aria-label="Remove ETH"]') as HTMLElement,
    );
    expect(committed().tags).toEqual(["BTC", "SOL"]);
    expect(tagInput().disabled).toBe(false); // back under the cap
  });
});

describe("FrameConfigDialog validation gating", () => {
  it("keeps an invalid draft local — shows the error, does NOT commit or call onApply", () => {
    const { container, onApply, committed } = setup();
    const field = () =>
      container.querySelector("#zf-cfg-label") as HTMLInputElement;

    // "ab" is under the schema's min length of 3.
    fireEvent.change(field(), { target: { value: "ab" } });

    expect(container.querySelector(".zf-config-error")).not.toBeNull();
    expect(field().value).toBe("ab"); // draft retained, no snap-back
    expect(committed().label).toBe("Name"); // shared instance untouched
    expect(onApply).not.toHaveBeenCalled();
  });

  it("clears the error and commits once the edit becomes valid", () => {
    const { container, onApply, committed } = setup();
    const field = () =>
      container.querySelector("#zf-cfg-label") as HTMLInputElement;

    fireEvent.change(field(), { target: { value: "ab" } });
    expect(container.querySelector(".zf-config-error")).not.toBeNull();

    fireEvent.change(field(), { target: { value: "Valid" } });
    expect(container.querySelector(".zf-config-error")).toBeNull();
    expect(committed().label).toBe("Valid");
    expect(onApply).toHaveBeenLastCalledWith("f1");
  });
});

/**
 * Not committing an invalid draft is right — inputs must never snap back
 * mid-edit — but on its own it silently discarded work: the dialog showed your
 * text, the card kept the old value, and Done/Esc/backdrop all closed without a
 * word, so Save wrote the old value and the edit was simply gone.
 *
 * The resolution is to make the state impossible to leave *unknowingly*: say the
 * draft isn't applied, block the exit that would drop it, and offer Revert as a
 * one-click way out so the dialog is still never a trap.
 */
describe("FrameConfigDialog invalid-draft exits", () => {
  const invalidate = (container: HTMLElement) =>
    fireEvent.change(
      container.querySelector("#zf-cfg-label") as HTMLInputElement,
      { target: { value: "ab" } },
    );

  it("states that the draft is not applied and won't be saved", () => {
    const { container, getByRole } = setup();
    invalidate(container);

    // Announced, not just coloured — the consequence is the part that matters.
    const alert = getByRole("alert");
    expect(alert.textContent).toContain("aren’t applied");
    expect(alert.textContent).toContain("Save will write");
    // The raw validator output is still there for the fix, just demoted.
    expect(alert.textContent).toContain("label");
  });

  it("blocks Done while the draft is invalid", () => {
    const { container, getByRole, onClose } = setup();
    invalidate(container);

    const done = getByRole("button", { name: "Done" });
    expect(done.hasAttribute("disabled")).toBe(true);
    fireEvent.click(done);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("reverts to the last valid config, then allows Done again", () => {
    const { container, getByRole, onClose, committed } = setup();
    const field = () =>
      container.querySelector("#zf-cfg-label") as HTMLInputElement;
    invalidate(container);
    expect(field().value).toBe("ab");

    fireEvent.click(getByRole("button", { name: "Revert" }));

    // Snapped back to what the card is actually rendering — a visible change,
    // which is the whole difference from the silent discard this replaces.
    expect(field().value).toBe("Name");
    expect(committed().label).toBe("Name");
    expect(container.querySelector(".zf-config-error")).toBeNull();

    fireEvent.click(getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Esc reverts instead of closing over an invalid draft", () => {
    const { container, onClose } = setup();
    const field = () =>
      container.querySelector("#zf-cfg-label") as HTMLInputElement;
    invalidate(container);

    fireEvent.keyDown(document, { key: "Escape" });
    // Did NOT close-and-discard; reverted in place so the loss is visible.
    expect(onClose).not.toHaveBeenCalled();
    expect(field().value).toBe("Name");

    // With the draft valid again, Esc closes as usual.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("a backdrop click reverts instead of closing over an invalid draft", () => {
    const { container, onClose } = setup();
    const backdrop = container.querySelector(
      ".zf-dialog-backdrop",
    ) as HTMLElement;
    invalidate(container);

    fireEvent.mouseDown(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    expect(
      (container.querySelector("#zf-cfg-label") as HTMLInputElement).value,
    ).toBe("Name");

    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("leaves a valid draft's exits exactly as they were", () => {
    const { getByRole, onClose } = setup();
    fireEvent.click(getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // Revert is only offered when there's something to revert from.
    expect(() => getByRole("button", { name: "Revert" })).toThrow();
  });
});

/**
 * The card's Events panel. Markers live on the INSTANCE (`events`), not in
 * `config`, so they take their own commit path — and the panel is offered only
 * for frames whose meta says `annotatable`, because a marker anywhere else
 * parses fine and then draws nothing.
 */
describe("FrameConfigDialog events panel", () => {
  const panelHeads = () =>
    [...document.querySelectorAll(".zf-style-head-label")].map(
      (el) => el.textContent,
    );
  /** Idempotent: the panel already starts open when the card has markers. */
  const openEvents = () => {
    const head = [...document.querySelectorAll(".zf-style-head")].find((h) =>
      h.textContent?.includes("Events"),
    );
    if (head!.getAttribute("aria-expanded") !== "true") fireEvent.click(head!);
  };
  const addEvent = () => {
    const add = [...document.querySelectorAll("button")].find((b) =>
      /Add event/.test(b.textContent ?? ""),
    );
    fireEvent.click(add!);
  };
  const chart = { frame: "synthetic-chart" } as const;

  it("is offered on an annotatable frame and hidden on every other", () => {
    const withPanel = setup({}, chart);
    expect(panelHeads()).toContain("Events");
    withPanel.unmount();
    setup();
    expect(panelHeads()).not.toContain("Events");
  });

  it("adds a marker to the instance — dated today, with a label that validates", () => {
    const { committedInstance, onApply } = setup({}, chart);
    openEvents();
    addEvent();
    const events = committedInstance().events!;
    expect(events).toHaveLength(1);
    // A blank label would fail the spec's min(1) at save time.
    expect(events[0].label.length).toBeGreaterThan(0);
    expect(events[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(onApply).toHaveBeenCalledWith("f1");
  });

  it("edits a marker in place, leaving fields the form doesn't expose alone", () => {
    // `url` is agent- or hand-authored; fixing a typo in the label must not
    // silently drop the source link.
    const { committedInstance } = setup(
      {},
      {
        ...chart,
        events: [
          { date: "2026-03-18", label: "FOMC", url: "https://example.com/a" },
        ],
      },
    );
    openEvents();
    const label = document.querySelector(
      'input[aria-label="Event 1 label"]',
    ) as HTMLInputElement;
    fireEvent.change(label, { target: { value: "FOMC +25bp" } });
    expect(committedInstance().events).toEqual([
      { date: "2026-03-18", label: "FOMC +25bp", url: "https://example.com/a" },
    ]);
  });

  it("keeps the time of day when only the calendar day is edited", () => {
    const { committedInstance } = setup(
      {},
      { ...chart, events: [{ date: "2026-03-18T14:30", label: "CPI" }] },
    );
    openEvents();
    const date = document.querySelector(
      'input[aria-label="Event 1 date"]',
    ) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2026-03-19" } });
    expect(committedInstance().events?.[0].date).toBe("2026-03-19T14:30");
  });

  it("drops the `events` key entirely when the last marker is removed", () => {
    // A card that ends up with no markers must round-trip byte-identical to one
    // that never had any — not carry an empty array through every save.
    const { committedInstance } = setup(
      {},
      { ...chart, events: [{ date: "2026-03-18", label: "FOMC" }] },
    );
    openEvents();
    const remove = document.querySelector(
      'button[aria-label="Remove event 1"]',
    ) as HTMLButtonElement;
    fireEvent.click(remove);
    expect(committedInstance().events).toBeUndefined();
  });
});
