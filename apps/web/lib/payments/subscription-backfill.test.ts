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

  it("covers the concurrent-delivery case, where the row is already `paid`", () => {
    // The expected ordering, not an exotic one: `checkout.completed` and `subscription.completed`
    // are both emitted for ONE first charge. The loser re-reads under the advisory lock AFTER the
    // winner committed `paid`, sees a still-null subscription id, and must deposit its own.
    expect(needsSubscriptionIdBackfill(null, "subs_123")).toBe(true);
    // Symmetric: if `subscription.completed` wins and stores the id, the losing
    // `checkout.completed` carries none and must leave the stored id untouched.
    expect(needsSubscriptionIdBackfill("subs_123", null)).toBe(false);
  });

  it("is idempotent — a second run is always a no-op", () => {
    // Every 5xx must be safe to retry, so the back-fill has to survive redelivery. Once the id is
    // stored, re-running with the same event must not produce a second write.
    const stored: string | null = null;
    expect(needsSubscriptionIdBackfill(stored, "subs_123")).toBe(true);
    const afterFirstRun = "subs_123";
    expect(needsSubscriptionIdBackfill(afterFirstRun, "subs_123")).toBe(false);
  });

  it("treats an empty stored id as present rather than missing", () => {
    // Defensive: an empty string is not NULL in Postgres, so the `IS NULL` predicate on the
    // UPDATE would match nothing anyway. Agreeing with the database avoids a pointless write.
    expect(needsSubscriptionIdBackfill("", "subs_123")).toBe(false);
  });
});
