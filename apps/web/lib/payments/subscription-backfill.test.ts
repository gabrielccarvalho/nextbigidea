import { describe, expect, it } from "vitest";
import { needsSubscriptionIdBackfill } from "./subscription-backfill";

describe("needsSubscriptionIdBackfill", () => {
  it("back-fills when the row has no id and the event carries one", () => {
    // The exact `checkout.completed` -> `subscription.completed` ordering that lost the id.
    expect(needsSubscriptionIdBackfill(null, "subs_123")).toBe(true);
    expect(needsSubscriptionIdBackfill(undefined, "subs_123")).toBe(true);
  });

  it("never overwrites an id that is already stored", () => {
    // A redelivered event, or a `checkout.completed` retry arriving after the id was captured.
    expect(needsSubscriptionIdBackfill("subs_123", "subs_123")).toBe(false);
    expect(needsSubscriptionIdBackfill("subs_123", "subs_other")).toBe(false);
  });

  it("does nothing when the event carries no id", () => {
    // `checkout.completed` carries none — writing would null out the join key for renewals.
    expect(needsSubscriptionIdBackfill(null, null)).toBe(false);
    expect(needsSubscriptionIdBackfill(null, undefined)).toBe(false);
    expect(needsSubscriptionIdBackfill("subs_123", null)).toBe(false);
    expect(needsSubscriptionIdBackfill("subs_123", undefined)).toBe(false);
  });

  it("treats an empty stored id as present rather than missing", () => {
    // Defensive: an empty string is not NULL in Postgres, so the `IS NULL` predicate on the
    // UPDATE would match nothing anyway. Agreeing with the database avoids a pointless write.
    expect(needsSubscriptionIdBackfill("", "subs_123")).toBe(false);
  });
});
