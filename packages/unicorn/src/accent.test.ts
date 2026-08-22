import { describe, expect, it } from "vitest";
import {
  ACCENT_DEFAULT_HUE,
  ACCENT_DEFAULT_SAT,
  accentRotation,
  accentSaturation,
} from "./accent";

// The accent→filter math both hosts share. Nothing here can fail loudly: a
// wrong rotation is a backdrop that spins the long way round (or the wrong way
// entirely) and a wrong saturation is a backdrop that quietly disagrees with
// the cards — both read as design, never as an error. Hence the pins.
describe("accentRotation", () => {
  it("is a no-op when the accent matches the scene's authored hue", () => {
    expect(accentRotation(ACCENT_DEFAULT_HUE, ACCENT_DEFAULT_HUE)).toBe(0);
  });

  it("takes the SHORT way round the wheel in both directions", () => {
    // +300° the naive way is -60° the short way, and vice versa. JS `%` keeps
    // the dividend's sign, so a single modulo returns -300 here.
    expect(accentRotation(242 + 300, 242)).toBe(-60);
    expect(accentRotation(242 - 300, 242)).toBe(60);
  });

  it("keeps 180 positive and flips just past it", () => {
    expect(accentRotation(180, 0)).toBe(180);
    expect(accentRotation(181, 0)).toBe(-179);
  });
});

describe("accentSaturation", () => {
  it("maps the spec default to saturate(1)", () => {
    expect(accentSaturation(ACCENT_DEFAULT_SAT)).toBe(1);
  });

  it("desaturates a muted accent and rounds to 3 decimals", () => {
    expect(accentSaturation(45)).toBe(0.5);
    expect(accentSaturation(20)).toBe(0.222);
  });
});
