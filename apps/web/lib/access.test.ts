import { describe, expect, it } from "vitest";
import { computeAccess } from "./access";

describe("computeAccess", () => {
  it("grants full access when a paid purchase exists", () => {
    expect(computeAccess(true)).toEqual({ hasFullAccess: true });
  });
  it("denies full access with no paid purchase", () => {
    expect(computeAccess(false)).toEqual({ hasFullAccess: false });
  });
});
