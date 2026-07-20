import { describe, expect, it } from "vitest";
import { isAdmin } from "./admin";

describe("isAdmin", () => {
  it("matches a user id in the comma-separated allowlist", () => {
    expect(isAdmin("u2", "u1,u2,u3")).toBe(true);
  });
  it("rejects a non-listed id", () => {
    expect(isAdmin("u9", "u1,u2")).toBe(false);
  });
  it("rejects null and empty allowlist", () => {
    expect(isAdmin(null, "u1")).toBe(false);
    expect(isAdmin("u1", "")).toBe(false);
  });
  it("tolerates spaces around ids", () => {
    expect(isAdmin("u2", "u1, u2 , u3")).toBe(true);
  });
});
