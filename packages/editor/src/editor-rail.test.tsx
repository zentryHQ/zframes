// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { escapeLayerDepth, pushEscapeLayer } from "@zframes/core";
import { RailSearch } from "./editor-rail";

// The rail's search box used to answer Escape from its own key handler and call
// `stopPropagation` so the config dialog's document-level listener wouldn't also
// see the press. It is now a layer on the shared Escape stack instead, which is
// what makes "one press closes one thing" hold across surfaces rather than
// per-surface patches.

afterEach(() => {
  cleanup();
  expect(escapeLayerDepth()).toBe(0);
});

function renderSearch(initial: string) {
  const onChange = vi.fn();
  const view = render(
    <RailSearch
      value={initial}
      onChange={onChange}
      placeholder="Search frames"
      label="Search frames"
    />,
  );
  return { ...view, onChange, input: screen.getByLabelText("Search frames") };
}

describe("RailSearch Escape", () => {
  it("clears the query while focused", () => {
    const { input, onChange } = renderSearch("price");
    fireEvent.focus(input);
    expect(escapeLayerDepth()).toBe(1);

    fireEvent.keyDown(input, { key: "Escape" });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("registers no layer with nothing to clear, so Escape reaches its owner", () => {
    const { input, onChange } = renderSearch("");
    fireEvent.focus(input);
    // An empty box has no dismissable state, so it must not consume the press.
    expect(escapeLayerDepth()).toBe(0);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("registers no layer once focus leaves, even with a query left in it", () => {
    const { input } = renderSearch("price");
    fireEvent.focus(input);
    fireEvent.blur(input);
    // A stale query in a box nobody is typing in is not what Escape is aimed at.
    expect(escapeLayerDepth()).toBe(0);
  });

  it("yields to a surface opened after it", () => {
    const { input, onChange } = renderSearch("price");
    fireEvent.focus(input);
    const later = vi.fn();
    const release = pushEscapeLayer(later);

    fireEvent.keyDown(input, { key: "Escape" });
    // Topmost-first: the thing opened last closes first, and only it.
    expect(later).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();

    release();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onChange).toHaveBeenCalledWith("");
  });
});
