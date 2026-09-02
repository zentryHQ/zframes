// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  FrameStatus,
  cellLabelFits,
  scrollAreaClass,
  scrollAreaXClass,
} from "./ui";

afterEach(cleanup);

/**
 * `FrameStatus`'s two branches are a CROSS-PACKAGE CONTRACT, not just styling.
 *
 * `apps/explorer/scripts/capture-thumbs.ts` decides when a board is photographable
 * by querying the DOM for both of them:
 *   • `[aria-busy="true"]`  — still loading, wait
 *   • `[data-zf-empty]`     — resolved with no data, wait then refuse to publish
 *
 * Neither is visible in this package, so nothing here would fail if a well-meaning
 * refactor dropped one — the nightly job would simply go back to photographing
 * half-loaded boards, which is exactly the bug this attribute was added to fix
 * (gold-desk shipped a thumbnail reading "no fix history yet" across half its
 * cards). These tests are the tripwire.
 */
describe("FrameStatus — the capture contract", () => {
  it("marks the EMPTY branch with data-zf-empty", () => {
    const { container } = render(<FrameStatus>no fix history yet</FrameStatus>);
    expect(container.querySelector("[data-zf-empty]")).not.toBeNull();
  });

  it("does NOT mark the empty branch as busy", () => {
    // An empty frame has finished. Claiming aria-busy would both lie to a screen
    // reader and make the capture wait out its full timeout on every such board.
    const { container } = render(<FrameStatus>no data</FrameStatus>);
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("marks the LOADING branch busy", () => {
    const { container } = render(<FrameStatus loading>loading…</FrameStatus>);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("does NOT mark the loading branch as empty", () => {
    // The two states must stay distinguishable: the capture waits on both but
    // treats them differently — loading is patience, empty is a quality signal.
    const { container } = render(<FrameStatus loading>loading…</FrameStatus>);
    expect(container.querySelector("[data-zf-empty]")).toBeNull();
  });

  it("still renders the caller's message in the empty branch", () => {
    const { getByText } = render(
      <FrameStatus>no London fix history yet</FrameStatus>,
    );
    expect(getByText("no London fix history yet")).toBeTruthy();
  });
});

describe("cellLabelFits", () => {
  it("rejects a cell that is wide enough but too short", () => {
    // The regression this exists for: a 20-year seasonality matrix leaves each
    // row ~11px, and a width-only guard printed a caption clipped top and
    // bottom across the whole grid.
    expect(cellLabelFits(120, 11, 44)).toBe(false);
    expect(cellLabelFits(120, 16, 44)).toBe(true);
  });

  it("still rejects a narrow cell", () => {
    expect(cellLabelFits(30, 40, 44)).toBe(false);
  });
});

/**
 * The scroll area's gutter (`pr-1` / `pb-1`) is sized for a six-pixel thumb,
 * which is a promise only the `-webkit-` pseudo-elements were keeping: Firefox
 * painted its full-width OS scrollbar into that gutter and the last column of
 * every list sat under the track.
 */
describe("the shared scroll area", () => {
  it("styles the scrollbar for browsers with no -webkit- pseudo-elements", () => {
    for (const cls of [scrollAreaClass, scrollAreaXClass]) {
      expect(cls).toContain("[scrollbar-width:thin]");
      expect(cls).toContain("scrollbar-color:");
    }
  });

  it("colours the thumb from the board's ink rather than a literal white", () => {
    // `--zf-ink-l` is 100% on a dark board and 16% on a light one, so a
    // hard-coded white thumb is invisible on half the surfaces we ship.
    for (const cls of [scrollAreaClass, scrollAreaXClass]) {
      expect(cls).toContain("--zf-ink-l");
      expect(cls).not.toContain("bg-white");
    }
  });
});

describe("the loading skeleton's fill", () => {
  it("draws its bars against the board's ink, not a literal white", () => {
    // Four percent of white over a near-white Light surface is nothing at all:
    // the card read as empty rather than as loading.
    const { container } = render(<FrameStatus loading>loading…</FrameStatus>);
    const styled = [...container.querySelectorAll("span[style]")].map(
      (el) => el.getAttribute("style") ?? "",
    );
    const inked = styled.filter((style) => style.includes("--zf-ink-l"));
    expect(inked.length).toBe(6);
    expect(container.innerHTML).not.toContain("bg-white");
  });
});
