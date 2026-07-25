import { describe, expect, it } from "vitest";
import { clampPage, pageWindow } from "./pagination";

describe("clampPage", () => {
  it("defaults to page 1 when the param is missing or garbage", () => {
    expect(clampPage(undefined, 5)).toBe(1);
    expect(clampPage("", 5)).toBe(1);
    expect(clampPage("abc", 5)).toBe(1);
  });

  it("passes a valid in-range page through", () => {
    expect(clampPage("3", 5)).toBe(3);
  });

  // A shared link can outlive the list it pointed at — clamp, never 404.
  it("clamps out-of-range pages into the valid range", () => {
    expect(clampPage("99", 5)).toBe(5);
    expect(clampPage("0", 5)).toBe(1);
    expect(clampPage("-2", 5)).toBe(1);
  });

  it("treats an empty list as a single page", () => {
    expect(clampPage("7", 0)).toBe(1);
  });
});

describe("pageWindow", () => {
  it("lists every page when there are no gaps to elide", () => {
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("elides the middle from the first page", () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, "…", 10]);
  });

  it("keeps first and last visible around a middle page", () => {
    expect(pageWindow(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
  });

  it("elides the middle from the last page", () => {
    expect(pageWindow(10, 10)).toEqual([1, "…", 9, 10]);
  });

  // A page adjacent to the boundary must not produce "1 … 2" — there is no gap.
  it("never inserts an ellipsis for a gap of one", () => {
    expect(pageWindow(3, 10)).toEqual([1, 2, 3, 4, "…", 10]);
  });

  it("handles a single page", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
  });
});
