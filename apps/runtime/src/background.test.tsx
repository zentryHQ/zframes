// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { BackgroundSchema } from "@zframes/spec/spec";
import { DashboardBackground } from "./background";

// Two exits this file gets wrong easily. The scene branch is the only one that
// used to skip the light fill, so a light board with an Aurora scene kept dark
// gutters — and a *weak* machine (which skips the scene) rendered the same
// board correctly, which is the tell. And a scene at zero opacity was still
// fully downloaded and still rendering, invisibly, for the whole session.

const { lowEnd } = vi.hoisted(() => ({ lowEnd: { value: false } }));
vi.mock("@zframes/unicorn", () => ({ useLowEndDevice: () => lowEnd.value }));
vi.mock("@zframes/unicorn/scene", () => ({
  default: () => <div data-testid="scene" />,
}));

const background = (over: Record<string, unknown> = {}) =>
  BackgroundSchema.parse({ type: "unicorn", projectId: "abc", ...over });

/** The light-surface fill every "no scene" exit paints. */
const lightFill = () =>
  [...document.querySelectorAll<HTMLElement>("div")].find((el) =>
    el.style.background.includes("linear-gradient(160deg"),
  );

afterEach(() => {
  cleanup();
  lowEnd.value = false;
});

describe("the dashboard backdrop", () => {
  it("paints the light fill UNDER a scene on a light board", async () => {
    render(<DashboardBackground background={background()} surface="light" />);
    // The scene is translucent, so without a fill beneath it the gutters stay
    // dark on a light board.
    expect(lightFill()).toBeDefined();
    expect(await screen.findByTestId("scene")).toBeDefined();
  });

  it("paints no fill under a scene on a dark board", async () => {
    render(<DashboardBackground background={background()} surface="dark" />);
    // Dark keeps the body's own indigo glow showing through.
    expect(lightFill()).toBeUndefined();
    expect(await screen.findByTestId("scene")).toBeDefined();
  });

  it("never mounts a scene at zero opacity", async () => {
    render(
      <DashboardBackground
        background={background({ opacity: 0 })}
        surface="light"
      />,
    );
    // Opacity 0 means "no backdrop", so it takes the same exit as type "none"
    // rather than downloading an engine to render nothing.
    await waitFor(() => expect(screen.queryByTestId("scene")).toBeNull());
    expect(lightFill()).toBeDefined();
  });

  it("skips the scene on a low-end device", async () => {
    lowEnd.value = true;
    render(<DashboardBackground background={background()} surface="light" />);
    await waitFor(() => expect(screen.queryByTestId("scene")).toBeNull());
    expect(lightFill()).toBeDefined();
  });
});
