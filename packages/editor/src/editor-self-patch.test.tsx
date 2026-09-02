// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { z } from "zod";
import { DashboardEditor } from "./editor";
import { createRegistry, defineFrame } from "@zframes/spec/frame";
import { DashboardSpecSchema } from "@zframes/spec/spec";
import type { DashboardSpec } from "@zframes/spec/spec";
import { FramesProvider, useFramePatch } from "@zframes/core";
import type { MarketDataProvider } from "@zframes/spec/types";

// A SELF-PATCH is a frame writing its own config from its own interior — a
// checklist tick, a chart's timeframe, a stopwatch, a note's text — through
// `useFramePatch`. In practice it only happens in viewing mode, where the card
// interiors are the only interactive thing on the page.
//
// It used to land in the editor's working copy with no history entry, no dirty
// dot and no way back, and then be written into dashboard.json by whatever
// unrelated Save the user pressed next: the same action was simultaneously
// unsaveable on purpose and permanently persistable, decided by something the
// user did minutes later. Cancel didn't help either — the change was inside the
// baseline, so cancelling restored *to* it.
//
// It is now exactly one of two things, and this file pins both:
//   * with `onAutoSave` wired → DURABLE, persisted on its own short debounce;
//   * without one → TRANSIENT, reverted the moment customise mode opens, so no
//     Save can carry it and no Cancel can be defeated by it.

const provider: MarketDataProvider = { name: "none", capabilities: [] };

const noteFrame = defineFrame({
  name: "note",
  label: "Note",
  category: "tools",
  description: "writes its own config from its interior",
  capabilities: [],
  schema: z.object({ text: z.string().default("") }),
  component: function Note({ config }: { config: { text: string } }) {
    const patch = useFramePatch();
    return (
      <button
        type="button"
        data-testid="note"
        data-text={config.text}
        onClick={() => patch?.({ text: "typed" })}
      >
        {config.text}
      </button>
    );
  },
});

const registry = createRegistry([noteFrame]);

function specWith(text = ""): DashboardSpec {
  return DashboardSpecSchema.parse({
    title: "self-patch",
    grid: { columns: 12, rowHeight: 90, rows: 3, gap: 12 },
    frames: [
      {
        id: "n",
        frame: "note",
        position: { x: 0, y: 0, w: 4, h: 3 },
        config: { text },
      },
    ],
  });
}

function mount(
  props: Partial<Parameters<typeof DashboardEditor>[0]> = {},
): ReturnType<typeof render> & {
  onSave: ReturnType<typeof vi.fn>;
} {
  const onSave = vi.fn();
  const view = render(
    <FramesProvider providers={[provider]}>
      <DashboardEditor
        spec={specWith()}
        registry={registry}
        onSave={onSave}
        {...props}
      />
    </FramesProvider>,
  );
  return { ...view, onSave };
}

/** The card's own interior, mounted in its per-item React root. */
function note(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-testid="note"]');
  if (!el) throw new Error("the note frame never mounted");
  return el;
}

async function patchFromInside(container: HTMLElement) {
  await act(async () => {
    fireEvent.click(note(container));
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a self-patch with no host to persist it is transient", () => {
  it("is reverted when customise mode opens, so no Save can carry it", async () => {
    const view = mount();
    await patchFromInside(view.container);
    // It is on screen — the change is real while the page is open.
    expect(note(view.container).dataset.text).toBe("typed");

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Customize" }));
    });
    // Reverted BEFORE the session baseline is taken, and the card re-rendered
    // to say so.
    expect(note(view.container).dataset.text).toBe("");
    // So the session opens clean: there is nothing pending, which is exactly
    // what the (absent) dirty dot has been telling the user all along.
    expect(view.container.querySelector(".zf-dirty-dot")).toBeNull();

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Save" }));
    });
    const saved = view.onSave.mock.calls[0][0] as DashboardSpec;
    expect(saved.frames[0].config).toEqual({ text: "" });
  });

  it("survives an ordinary viewing session untouched", async () => {
    // The revert is scoped to entering customise mode. Nothing about viewing
    // should undo the tick the user just made.
    const view = mount();
    await patchFromInside(view.container);
    await act(async () => {
      fireEvent.pointerOver(note(view.container));
    });
    expect(note(view.container).dataset.text).toBe("typed");
  });
});

describe("a self-patch with a host to persist it is durable", () => {
  it("is written on its own debounce, coalescing a burst", async () => {
    vi.useFakeTimers();
    const onAutoSave = vi.fn<(next: DashboardSpec) => Promise<void>>(
      async () => {},
    );
    const view = mount({ onAutoSave });

    await act(async () => {
      fireEvent.click(note(view.container));
      fireEvent.click(note(view.container));
    });
    // Nothing yet: the window is trailing, so a burst is one write.
    expect(onAutoSave).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    expect(onAutoSave).toHaveBeenCalledTimes(1);
    const sent = onAutoSave.mock.calls[0][0];
    expect(sent.frames[0].config).toEqual({ text: "typed" });
  });

  it("keeps the change when customise mode opens", async () => {
    // The revert is the *transient* branch. A durable patch is already on its
    // way to disk, so reverting it would undo a change the file already has.
    vi.useFakeTimers();
    const onAutoSave = vi.fn<(next: DashboardSpec) => Promise<void>>(
      async () => {},
    );
    const view = mount({ onAutoSave });
    await act(async () => {
      fireEvent.click(note(view.container));
    });
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Customize" }));
    });
    expect(note(view.container).dataset.text).toBe("typed");
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Save" }));
    });
    const saved = view.onSave.mock.calls[0][0] as DashboardSpec;
    expect(saved.frames[0].config).toEqual({ text: "typed" });
  });

  it("does not interrupt the reader when the write fails", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onAutoSave = vi.fn<(next: DashboardSpec) => Promise<void>>(
      async () => {
        throw new Error("EACCES");
      },
    );
    const view = mount({ onAutoSave });
    await act(async () => {
      fireEvent.click(note(view.container));
    });
    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    // No alert pill: the user pressed no Save, and interrupting a reader over a
    // background write they never asked for is worse than the write not
    // landing. The change stays on screen.
    expect(view.queryByRole("alert")).toBeNull();
    expect(note(view.container).dataset.text).toBe("typed");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("a self-patch made INSIDE customise mode is an ordinary edit", () => {
  it("is undoable and rides the dirty dot", async () => {
    // Card interiors are inert while customising, so this is not a path a user
    // reaches today — but if a frame ever does write from inside a session, the
    // one thing it must not be is invisible to undo and to Save.
    const view = mount();
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Customize" }));
    });
    await patchFromInside(view.container);

    expect(view.container.querySelector(".zf-dirty-dot")).not.toBeNull();
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Undo" }));
    });
    expect(note(view.container).dataset.text).toBe("");
  });
});
