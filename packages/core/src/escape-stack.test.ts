// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { escapeLayerDepth, pushEscapeLayer } from "./escape-stack";

function pressEscape() {
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
}

const releases: Array<() => void> = [];
afterEach(() => {
  while (releases.length) releases.pop()?.();
});

describe("escape stack", () => {
  it("does nothing (and consumes nothing) with no layers", () => {
    const event = pressEscape();
    expect(event.defaultPrevented).toBe(false);
    expect(escapeLayerDepth()).toBe(0);
  });

  it("hands one press to the topmost layer only, and consumes it", () => {
    const calls: string[] = [];
    releases.push(pushEscapeLayer(() => calls.push("bottom")));
    releases.push(pushEscapeLayer(() => calls.push("top")));
    const event = pressEscape();
    expect(calls).toEqual(["top"]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("falls through to the next layer once the top is released", () => {
    const calls: string[] = [];
    releases.push(pushEscapeLayer(() => calls.push("bottom")));
    const releaseTop = pushEscapeLayer(() => calls.push("top"));
    releaseTop();
    releaseTop(); // idempotent
    pressEscape();
    expect(calls).toEqual(["bottom"]);
    expect(escapeLayerDepth()).toBe(1);
  });

  it("lets an inner handler that stops propagation win over the stack", () => {
    let layerCalls = 0;
    releases.push(pushEscapeLayer(() => void layerCalls++));
    const inner = document.createElement("button");
    document.body.appendChild(inner);
    inner.addEventListener("keydown", (e) => e.stopPropagation());
    inner.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    inner.remove();
    expect(layerCalls).toBe(0);
  });

  it("skips a press something inside already handled via preventDefault", () => {
    let layerCalls = 0;
    releases.push(pushEscapeLayer(() => void layerCalls++));
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    window.dispatchEvent(event);
    expect(layerCalls).toBe(0);
  });
});
