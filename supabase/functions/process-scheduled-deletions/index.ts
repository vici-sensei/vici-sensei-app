import Stripe from "npm:stripe@22";
import { corsHeaders, handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseClients.ts";
import { cancelActiveSubscriptions } from "../_shared/stripe.ts";

// Invoked on a daily cron schedule (see the
// 20260819_process_scheduled_deletions_cron.sql manual setup migration) with
// the service-role key as its bearer token -- there's no end user attached to
// this request, unlike delete-account which only *schedules* the deletion.
// This is what actually finalizes accounts whose 30-day grace period has
// elapsed and nobody logged back in to cancel it.

const BATCH_SIZE = 200;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const admin = createAdminClient();

  const { data: dueUsers, error: fetchError } = await admin
    .from("users")
    .select("id, stripe_customer_id")
    .not("pending_deletion_at", "is", null)
    .lte("pending_deletion_at", new Date().toISOString())
    .limit(BATCH_SIZE);

  if (fetchError) {
    return jsonResponse(req, { error: fetchError.message }, 500);
  }

  const stripe = Deno.env.get("STRIPE_SECRET_KEY") ? new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!) : null;

  const results = await Promise.allSettled(
    (dueUsers ?? []).map(async (row) => {
      let hadActiveSubscription = false;
      let stripeCustomerDeleted = false;

      if (row.stripe_customer_id && stripe) {
        const canceledCount = await cancelActiveSubscriptions(stripe, row.stripe_customer_id);
        hadActiveSubscription = canceledCount > 0;
        await stripe.customers.del(row.stripe_customer_id);
        stripeCustomerDeleted = true;
      }

      const { error: deleteError } = await admin.auth.admin.deleteUser(row.id);
      if (deleteError) throw deleteError;

      const { error: auditError } = await admin.from("account_deletion_log").insert({
        user_id: row.id,
        had_active_subscription: hadActiveSubscription,
        stripe_customer_deleted: stripeCustomerDeleted,
      });
      if (auditError) console.error(`Failed to write account_deletion_log entry for ${row.id}:`, auditError.message);

      return row.id;
    })
  );

  const deleted = results.filter((r) => r.status === "fulfilled").length;
  const errors = results
    .map((r, i) => (r.status === "rejected" ? { userId: dueUsers![i].id, error: String(r.reason) } : null))
    .filter((e): e is { userId: string; error: string } => e !== null);

  if (errors.length > 0) console.error("process-scheduled-deletions errors:", errors);

  return new Response(JSON.stringify({ processed: dueUsers?.length ?? 0, deleted, errors }), {
    status: 200,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
});
