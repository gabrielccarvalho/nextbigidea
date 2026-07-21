import { describe, expect, it } from "vitest";
import { formatPaymentAlert, shouldSendPaymentAlert } from "./alert";

describe("shouldSendPaymentAlert", () => {
  it("sends when an alert address is configured", () => {
    expect(shouldSendPaymentAlert("ops@example.com")).toBe(true);
  });
  it("does not send when the address is unset", () => {
    expect(shouldSendPaymentAlert(undefined)).toBe(false);
    expect(shouldSendPaymentAlert("")).toBe(false);
  });
});

describe("formatPaymentAlert", () => {
  it("names the failure kind and includes the detail verbatim", () => {
    const out = formatPaymentAlert({ kind: "owner_not_found", detail: "subs_abc123" });
    expect(out.subject).toContain("owner_not_found");
    expect(out.body).toContain("subs_abc123");
  });

  // The whole point of this alert is that the operator can act on it. A body that
  // omits the identifier is unactionable — you cannot repair a row you cannot find.
  it("never produces an empty body", () => {
    const out = formatPaymentAlert({ kind: "row_still_pending", detail: "" });
    expect(out.body.length).toBeGreaterThan(0);
  });
});
