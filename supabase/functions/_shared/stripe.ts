import type Stripe from "npm:stripe@22";

/** Cancels every non-already-canceled subscription for a Stripe customer -- used both when a
 * user requests account deletion (delete-account) and when finalizing one after the grace
 * period elapses (process-scheduled-deletions). Returns how many were canceled. */
export async function cancelActiveSubscriptions(stripe: Stripe, customerId: string): Promise<number> {
  const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all" });
  const cancelable = subscriptions.data.filter((sub) => sub.status !== "canceled" && sub.status !== "incomplete_expired");
  await Promise.all(cancelable.map((sub) => stripe.subscriptions.cancel(sub.id)));
  return cancelable.length;
}
