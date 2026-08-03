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
// Every field carries a .describe(), mirroring the real registry — all 352
// config fields across the 231 frames have one, and the form is expected to
// surface each as visible help.
const schema = z.object({
  enabled: z.boolean().default(true).describe("Turn the thing on."), // → checkbox
  mode: z.enum(["fast", "slow"]).default("fast").describe("How fast to go."), // → <select>
  size: z.number().min(0).max(100).default(50).describe("Size, 0-100."), // → range slider (bounded)
  count: z.number().default(3).describe("How many."), // → number input (open-ended)
  color: z.string().default("#8b8df9").describe("Accent colour."), // → color picker
  text: z.string().default("hello").describe("Body copy."), // → textarea (key "text")
  label: z.string().min(3).default("Name").describe("At least 3 characters."), // → text input
  tags: z.array(z.string()).max(3).default([]).describe("Up to three tags."), // → tag list
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

  it("string[] → a tag list that preserves case, caps at maxItems, removes", () => {
    // Case is preserved EXACTLY as typed. This control used to force-uppercase
    // every token, which suits a ticker but corrupted 8 of the 11 string-array
    // fields in the registry: DeFiLlama protocol slugs must be
    // lowercase-hyphenated ("uniswap"), btc-fees tiers are camelCase enum
    // members ("halfHour"), and quote/rules-card/checklist items are prose.
    // Genuinely ticker-shaped fields are owned by the symbol picker, not this.
    const { container, committed } = setup();
    const tagInput = () =>
      container.querySelector("#zf-cfg-tags") as HTMLInputElement;

    const add = (raw: string) => {
      fireEvent.change(tagInput(), { target: { value: raw } });
      fireEvent.keyDown(tagInput(), { key: "Enter" });
    };

    add("uniswap");
    expect(committed().tags).toEqual(["uniswap"]);
    expect(
      container.querySelector('.zf-tag button[aria-label="Remove uniswap"]'),
    ).not.toBeNull();

    add("halfHour");
    add("Cut losers fast");
    expect(committed().tags).toEqual([
      "uniswap",
      "halfHour",
      "Cut losers fast",
    ]);
    // maxItems (3) reached → the input disables so no 4th can be added.
    expect(tagInput().disabled).toBe(true);

    fireEvent.click(
      container.querySelector(
        'button[aria-label="Remove halfHour"]',
      ) as HTMLElement,
    );
    expect(committed().tags).toEqual(["uniswap", "Cut losers fast"]);
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

// ─────────────────────────────────────────────────────────────────────────────
// The form's coverage of real schema shapes.
//
// A survey of all 231 frames found 352 config fields, and exactly FIVE that the
// generated form had no control for — all arrays: `image-gallery.images`,
// `link-grid.links`, `macro-calendar.events`, `breakeven.fills` (arrays of flat
// objects) and `checklist.checked` (a boolean[] the frame writes itself). Those
// fell through to a plain text input, so typing produced a string where an array
// was required, the draft never validated, and the frame was only configurable by
// hand-editing dashboard.json.
//
// The same survey found all 352 fields carry a `.describe()` — which the form
// only ever exposed as a `title=` tooltip.
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors the four real object-array fields: required + optional columns, a
 *  number column, a date column, and a minItems floor. */
const rowsFrame = defineFrame({
  name: "rows",
  label: "Rows",
  category: "tools",
  description: "object-array fields",
  capabilities: [],
  schema: z.object({
    links: z
      .array(
        z.object({
          label: z.string().min(1).describe("Tile caption."),
          url: z.string().min(1).describe("Destination URL (https)."),
          icon: z.string().default("").describe("Optional icon override."),
        }),
      )
      .min(1)
      .default([{ label: "TradingView", url: "https://tv.com", icon: "📈" }])
      .describe("The link tiles, in order."),
    fills: z
      .array(
        z.object({
          price: z.number().describe("Fill price."),
          date: z.string().describe("Fill date, ISO YYYY-MM-DD."),
        }),
      )
      .default([])
      .describe("Fills to average."),
    checked: z
      .array(z.boolean())
      .default([])
      .describe(
        "Per-item checked state; persisted automatically by the frame.",
      ),
  }),
  component: () => null,
});

const rowsRegistry = createRegistry([rowsFrame]);

function setupRows(configOverrides: Record<string, unknown> = {}) {
  const instance: FrameInstance = {
    id: "r1",
    frame: "rows",
    position: { x: 0, y: 0, w: 2, h: 2 },
    config: {
      links: [{ label: "TradingView", url: "https://tv.com", icon: "📈" }],
      fills: [],
      checked: [],
      ...configOverrides,
    },
  };
  const instancesRef = { current: new Map([[instance.id, instance]]) };
  const onApply = vi.fn();
  const view = render(
    <FrameConfigDialog
      instance={instance}
      registry={rowsRegistry}
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
      onClose={vi.fn()}
    />,
  );
  const committed = () =>
    instancesRef.current.get("r1")!.config as Record<string, unknown>;
  return { ...view, committed, onApply };
}

type Row = Record<string, unknown>;
const links = (c: Record<string, unknown>) => c.links as Row[];
const fills = (c: Record<string, unknown>) => c.fills as Row[];

describe("object[] → row editor", () => {
  it("renders one labelled control per item-schema property", () => {
    const { container } = setupRows();
    const rows = container.querySelectorAll(".zf-rows .zf-row");
    expect(rows).toHaveLength(1);
    // Columns come from the item schema, so all three appear with their values.
    expect(
      (container.querySelector("#zf-cfg-links-0-label") as HTMLInputElement)
        .value,
    ).toBe("TradingView");
    expect(
      (container.querySelector("#zf-cfg-links-0-url") as HTMLInputElement)
        .value,
    ).toBe("https://tv.com");
    expect(
      (container.querySelector("#zf-cfg-links-0-icon") as HTMLInputElement)
        .value,
    ).toBe("📈");
  });

  it("edits one cell without disturbing its siblings", () => {
    const { container, committed } = setupRows();
    fireEvent.change(
      container.querySelector("#zf-cfg-links-0-label") as HTMLInputElement,
      { target: { value: "Renamed" } },
    );
    expect(links(committed())[0]).toEqual({
      label: "Renamed",
      url: "https://tv.com",
      icon: "📈",
    });
  });

  it("adds a row seeded from the item schema, so it validates on arrival", () => {
    const { getByRole, committed } = setupRows();
    fireEvent.click(getByRole("button", { name: "Add link" }));

    const added = links(committed())[1];
    expect(links(committed())).toHaveLength(2);
    // Both required columns are present and non-empty — the whole point of
    // seeding, since an empty row would immediately invalidate the draft.
    expect(added.label).toBeTruthy();
    expect(added.url).toBe("https://");
    // Which means the config actually committed rather than erroring.
    expect(rowsFrame.schema.safeParse(committed()).success).toBe(true);
  });

  it("seeds a date column with a real ISO date, not the humanized key", () => {
    // "Date" satisfies the JSON-Schema string type but renders as Invalid Date.
    const { getByRole, committed } = setupRows();
    fireEvent.click(getByRole("button", { name: "Add fill" }));
    expect(fills(committed())[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("uses a native date picker for a date column and a number input for a number", () => {
    const { container, getByRole } = setupRows();
    fireEvent.click(getByRole("button", { name: "Add fill" }));
    expect(
      (container.querySelector("#zf-cfg-fills-0-date") as HTMLInputElement)
        .type,
    ).toBe("date");
    expect(
      (container.querySelector("#zf-cfg-fills-0-price") as HTMLInputElement)
        .type,
    ).toBe("number");
  });

  it("reorders rows and keeps the move buttons honest at the ends", () => {
    const { getByRole, committed } = setupRows({
      links: [
        { label: "A", url: "https://a.com", icon: "" },
        { label: "B", url: "https://b.com", icon: "" },
      ],
    });
    expect(
      getByRole("button", { name: "Move link 1 up" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      getByRole("button", { name: "Move link 2 down" }).hasAttribute(
        "disabled",
      ),
    ).toBe(true);

    fireEvent.click(getByRole("button", { name: "Move link 1 down" }));
    expect(links(committed()).map((r) => r.label)).toEqual(["B", "A"]);
  });

  it("honours minItems so the editor can't walk the config into an invalid state", () => {
    // links has .min(1): deleting the only row would make the draft invalid and
    // then block Done, so the delete is refused up front instead.
    const { getByRole, committed } = setupRows();
    expect(
      getByRole("button", { name: "Remove link 1" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(links(committed())).toHaveLength(1);
  });

  it("removes a row once above minItems", () => {
    const { getByRole, committed } = setupRows({
      links: [
        { label: "A", url: "https://a.com", icon: "" },
        { label: "B", url: "https://b.com", icon: "" },
      ],
    });
    fireEvent.click(getByRole("button", { name: "Remove link 1" }));
    expect(links(committed()).map((r) => r.label)).toEqual(["B"]);
  });
});

describe("unauthorable shapes", () => {
  it("shows a frame-managed field read-only instead of a dead text input", () => {
    // checklist.checked is a boolean[] the frame writes as you tick items. The
    // old fallback offered a text input whose every edit was silently discarded.
    const { container } = setupRows({ checked: [true, false] });
    const readonly = container.querySelector("#zf-cfg-checked");
    expect(readonly).not.toBeNull();
    expect(readonly!.textContent).toContain("true");
    // Not an input at all, and labelled as out of the user's hands.
    expect(readonly!.tagName.toLowerCase()).toBe("output");
    expect(container.textContent).toContain("managed by the frame");
  });
});

describe("schema descriptions as visible help", () => {
  it("renders .describe() as text, not only a hover tooltip", () => {
    const { container } = setupRows();
    const hint = container.querySelector("#zf-cfg-links-hint");
    expect(hint?.textContent).toBe("The link tiles, in order.");
    // And it's associated with the control for assistive tech.
    expect(
      container
        .querySelector("#zf-cfg-links")
        ?.getAttribute("aria-describedby"),
    ).toBe("zf-cfg-links-hint");
  });

  it("wires every generated control's description to visible help", () => {
    const { container } = setup();
    // One hint per described field on the synthetic all-branches frame.
    for (const key of [
      "enabled",
      "mode",
      "size",
      "count",
      "color",
      "text",
      "label",
      "tags",
    ]) {
      const hint = container.querySelector(`#zf-cfg-${key}-hint`);
      expect(hint, `no visible hint for "${key}"`).not.toBeNull();
    }
  });
});

describe("per-field validation messages", () => {
  it("puts the message on the offending control, not only in a footer blob", () => {
    const { container } = setup();
    fireEvent.change(
      container.querySelector("#zf-cfg-label") as HTMLInputElement,
      { target: { value: "ab" } },
    );

    const inline = container.querySelector("#zf-cfg-label-error");
    expect(inline).not.toBeNull();
    expect(inline!.textContent).toMatch(/3/); // the min-length message
    // The wrapper is flagged so the control itself can be ringed.
    expect(
      container
        .querySelector("#zf-cfg-label")
        ?.closest(".zf-field-wrap")
        ?.getAttribute("data-invalid"),
    ).toBe("true");
    // Fields that are fine stay unmarked.
    expect(container.querySelector("#zf-cfg-mode-error")).toBeNull();
  });

  it("reports a nested row issue on the row editor that owns it", () => {
    // A Zod path of links.0.label has to surface on the Links control — that's
    // the thing the user has to go and fix.
    const { container } = setupRows();
    fireEvent.change(
      container.querySelector("#zf-cfg-links-0-label") as HTMLInputElement,
      { target: { value: "" } },
    );
    const inline = container.querySelector("#zf-cfg-links-error");
    expect(inline).not.toBeNull();
    // Keeps the tail so the row is identifiable inside a long list.
    expect(inline!.textContent).toContain("0.label");
  });

  it("clears inline messages once the draft is valid again", () => {
    const { container } = setup();
    const field = () =>
      container.querySelector("#zf-cfg-label") as HTMLInputElement;
    fireEvent.change(field(), { target: { value: "ab" } });
    expect(container.querySelector("#zf-cfg-label-error")).not.toBeNull();
    fireEvent.change(field(), { target: { value: "Valid" } });
    expect(container.querySelector("#zf-cfg-label-error")).toBeNull();
  });
});

describe("dialog focus management", () => {
  it("moves focus to the first control in the body, not the close button", () => {
    // Plain DOM order puts the header's ✕ first, so an immediate Enter would
    // close the dialog you just opened.
    const { container } = setup();
    const active = document.activeElement;
    expect(container.contains(active)).toBe(true);
    expect(container.querySelector(".zf-dialog-body")?.contains(active)).toBe(
      true,
    );
    expect((active as HTMLElement).className).not.toContain("zf-dialog-close");
  });

  it("wraps Tab at both ends instead of escaping to the page behind", () => {
    // The dialog already claimed aria-modal="true"; Tab walked straight out into
    // the dashboard behind the backdrop, so a keyboard user could be typing into
    // a card they couldn't see.
    const { container } = setup();
    const dialog = container.querySelector(".zf-dialog") as HTMLElement;
    const focusables = [
      ...dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
    expect(focusables.length).toBeGreaterThan(2);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("returns focus to whatever opened it", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const view = setup();
    expect(document.activeElement).not.toBe(opener);

    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The holdings editor.
//
// No frame in the current registry declares a `holdings` field, so this control
// is reachable only through the keyed/account tier — which is exactly why its
// central defect went unnoticed: the per-holding amount was rendered as a
// read-only "x {amount}" label and hardcoded to 1 when a ticker was added, so a
// holdings frame could not be configured through the UI at all. A quantity you
// can't set is the one thing a holdings list is for.
// ─────────────────────────────────────────────────────────────────────────────

const holdingsFrame = defineFrame({
  name: "holdings-frame",
  label: "Holdings",
  category: "tools",
  description: "a keyed-tier portfolio with per-asset quantities",
  capabilities: [],
  schema: z.object({
    holdings: z
      .array(
        z.object({
          symbol: z.string().describe("Ticker held."),
          amount: z.number().describe("Units held."),
        }),
      )
      .default([])
      .describe("The positions to value."),
  }),
  component: () => null,
});

function setupHoldings(holdings: { symbol: string; amount: number }[]) {
  const instance: FrameInstance = {
    id: "h1",
    frame: "holdings-frame",
    position: { x: 0, y: 0, w: 2, h: 2 },
    config: { holdings },
  };
  const instancesRef = { current: new Map([[instance.id, instance]]) };
  const view = render(
    <FrameConfigDialog
      instance={instance}
      registry={createRegistry([holdingsFrame])}
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
      onApply={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  const committed = () =>
    (instancesRef.current.get("h1")!.config as Record<string, unknown>)
      .holdings as { symbol: string; amount: number }[];
  return { ...view, committed };
}

describe("holdings editor", () => {
  it("renders the amount as an editable number input per holding", () => {
    const { getByLabelText } = setupHoldings([
      { symbol: "BTC", amount: 0.5 },
      { symbol: "ETH", amount: 12 },
    ]);
    const btc = getByLabelText("Amount of BTC") as HTMLInputElement;
    expect(btc.type).toBe("number");
    expect(btc.disabled).toBe(false);
    expect(btc.readOnly).toBe(false);
    expect(btc.value).toBe("0.5");
    expect((getByLabelText("Amount of ETH") as HTMLInputElement).value).toBe(
      "12",
    );
  });

  it("commits an edited quantity to only that holding", () => {
    const { getByLabelText, committed } = setupHoldings([
      { symbol: "BTC", amount: 0.5 },
      { symbol: "ETH", amount: 12 },
    ]);
    fireEvent.change(getByLabelText("Amount of ETH"), {
      target: { value: "3.25" },
    });
    expect(committed()).toEqual([
      { symbol: "BTC", amount: 0.5 },
      { symbol: "ETH", amount: 3.25 },
    ]);
  });

  it("accepts fractional quantities, which crypto positions require", () => {
    const { getByLabelText, committed } = setupHoldings([
      { symbol: "BTC", amount: 1 },
    ]);
    fireEvent.change(getByLabelText("Amount of BTC"), {
      target: { value: "0.00042" },
    });
    expect(committed()[0].amount).toBe(0.00042);
  });
});
