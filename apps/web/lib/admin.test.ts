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
  // THE case that actually exercises both guards together. Neither the null-id
  // test nor the empty-allowlist test above can catch a removed guard on its
  // own: ["u1"].includes(null) and [""].includes("u1") are both false anyway.
  // But with BOTH guards gone, "" splits to [""] and [""].includes("") is TRUE —
  // an unconfigured deploy would grant admin to an empty user id. This is the
  // only assertion here that fails if either guard is deleted.
  it("denies an empty user id against an empty allowlist", () => {
    expect(isAdmin("", "")).toBe(false);
  });
});
