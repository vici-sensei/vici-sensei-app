import Stripe from "npm:stripe@22";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, requireUser } from "../_shared/supabaseClients.ts";
import { cancelActiveSubscriptions } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { supabase, user } = auth;

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return jsonResponse(req, { error: profileError.message }, 500);
  }

  // Deletion isn't instant: the account gets a 30-day grace period (see
  // process-scheduled-deletions) so a user who changes their mind can just log
  // back in. We do stop billing right away though -- there's no reason to keep
  // charging someone through a grace period they may never come back from.
  if (profile?.stripe_customer_id) {
    try {
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
      await cancelActiveSubscriptions(stripe, profile.stripe_customer_id);
    } catch (err) {
      return jsonResponse(
        req,
        {
          error: `Could not cancel the Stripe subscription before scheduling account deletion: ${
            err instanceof Error ? err.message : "unknown error"
          }. Configure Stripe or resolve this manually before retrying.`,
        },
        500
      );
    }
  }

  // Admin (service-role) client — authenticated only has column-level UPDATE
  // grants on (display_name, avatar_url, updated_at), so pending_deletion_at
  // needs the service role to write.
  const admin = createAdminClient();

  const pendingDeletionAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error: scheduleError } = await admin
    .from("users")
    .update({ pending_deletion_at: pendingDeletionAt })
    .eq("id", user.id);
  if (scheduleError) {
    return jsonResponse(req, { error: scheduleError.message }, 500);
  }

  return jsonResponse(req, { pendingDeletionAt }, 200);
});
