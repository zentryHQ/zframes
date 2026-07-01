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

const registry = createRegistry([syntheticFrame]);

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

function setup(configOverrides: Record<string, unknown> = {}) {
  const instance: FrameInstance = {
    id: "f1",
    frame: "synthetic",
    position: { x: 0, y: 0, w: 2, h: 2 },
    config: { ...baseConfig, ...configOverrides },
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
      onApply={onApply}
      onClose={onClose}
    />,
  );
  const committed = () =>
    instancesRef.current.get("f1")!.config as Record<string, unknown>;
  return { ...view, instancesRef, onApply, onClose, committed };
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
