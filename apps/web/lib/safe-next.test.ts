import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

const DEFAULT = "/ideas";

describe("safeNext", () => {
  it("falls back to the default for empty/absent input", () => {
    expect(safeNext(undefined)).toBe(DEFAULT);
    expect(safeNext(null)).toBe(DEFAULT);
    expect(safeNext("")).toBe(DEFAULT);
  });

  it("keeps a plain same-origin path", () => {
    expect(safeNext("/ideas")).toBe("/ideas");
    expect(safeNext("/account")).toBe("/account");
    expect(safeNext("/ideas/continuous-soc-2-evidence-collection")).toBe(
      "/ideas/continuous-soc-2-evidence-collection",
    );
  });

  it("keeps a path with a query string", () => {
    expect(safeNext("/ideas?sort=new")).toBe("/ideas?sort=new");
  });

  it("rejects absolute URLs (they don't start with /)", () => {
    expect(safeNext("http://evil.com")).toBe(DEFAULT);
    expect(safeNext("https://evil.com/path")).toBe(DEFAULT);
    expect(safeNext("javascript:alert(1)")).toBe(DEFAULT);
  });

  it("rejects protocol-relative //host — the classic open-redirect", () => {
    expect(safeNext("//evil.com")).toBe(DEFAULT);
    expect(safeNext("//evil.com/path")).toBe(DEFAULT);
  });

  it("rejects backslash tricks (browsers treat \\ like /)", () => {
    expect(safeNext("/\\evil.com")).toBe(DEFAULT);
    expect(safeNext("\\/evil.com")).toBe(DEFAULT);
  });

  it("rejects encoded payloads that decode into an escape", () => {
    // decodeURIComponent("%2F%2Fevil.com") === "//evil.com"
    expect(safeNext("%2F%2Fevil.com")).toBe(DEFAULT);
    // decodeURIComponent("/%5Cevil") === "/\\evil"
    expect(safeNext("/%5Cevil")).toBe(DEFAULT);
  });

  it("rejects malformed percent-encoding rather than throwing", () => {
    expect(safeNext("/%E0%A4%A")).toBe(DEFAULT);
  });

  it("rejects control characters and whitespace used to smuggle", () => {
    expect(safeNext("/ideas\nSet-Cookie: x")).toBe(DEFAULT);
    expect(safeNext("/ ideas")).toBe(DEFAULT);
    expect(safeNext(" /ideas")).toBe(DEFAULT);
  });

  it("rejects a bare value that is not a path", () => {
    expect(safeNext("ideas")).toBe(DEFAULT);
    expect(safeNext("mailto:foo@bar.com")).toBe(DEFAULT);
  });
});
