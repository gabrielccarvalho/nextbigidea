// Pure: no DB import, so it is testable without a database (see access.ts for why that matters
// for the test run).

/**
 * Whether a `paid` event should write its subscription id onto an ALREADY-EXISTING purchase row.
 *
 * Why this exists: `checkout.completed` and `subscription.completed` both map to `type: "paid"`
 * and both read the same charge id from `data.checkout.id`, but only `subscription.completed`
 * carries the subscription id. When `checkout.completed` is delivered FIRST it flips the pending
 * row to `paid` while (correctly) declining to write a null subscription id, and the
 * `subscription.completed` that follows then finds nothing still `pending` and falls through to
 * the fallback branch. Without a back-fill there, the subscription id is never stored at all — and
 * it is the ONLY join key back to a user for renewals, so every future renewal would fail its
 * owner lookup, 503 forever, and the customer's access would silently lapse at the first period
 * boundary.
 *
 * Back-fill is strictly additive: it only ever fills a NULL. Overwriting a non-null stored id
 * would be the original bug in reverse — a later `checkout.completed` retry (which carries no id)
 * must never be able to clear or replace an id an earlier event already captured.
 *
 * @param stored   the subscription id currently on the row, if any
 * @param incoming the subscription id carried by the event being processed, if any
 */
export function needsSubscriptionIdBackfill(
  stored: string | null | undefined,
  incoming: string | null | undefined,
): boolean {
  return Boolean(incoming) && (stored === null || stored === undefined);
}
