import { describe, expect, it } from "vitest";
import { isOverCap } from "../src/cap";

describe("isOverCap", () => {
  it("returns false when combined spend is under the cap", () => {
    expect(isOverCap(100, 200, 1000)).toBe(false);
  });

  it("returns true when combined spend lands exactly on the cap", () => {
    expect(isOverCap(400, 100, 500)).toBe(true);
  });

  it("returns true when combined spend exceeds the cap", () => {
    expect(isOverCap(400, 200, 500)).toBe(true);
  });

  it("returns false with zero prior spend and zero run spend against a positive cap", () => {
    expect(isOverCap(0, 0, 500)).toBe(false);
  });

  // The scenario Finding 1 exists to prevent: prior runs in the trailing
  // 30-day window already used up the whole budget, so this run must not
  // spend a single additional millicent even before it starts any paid work.
  it("returns true when prior spend alone already meets the cap, before any run spend", () => {
    expect(isOverCap(500, 0, 500)).toBe(true);
  });

  it("returns true when prior spend alone already exceeds the cap", () => {
    expect(isOverCap(600, 0, 500)).toBe(true);
  });
});
