import Stripe from "npm:stripe@22";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handlePreflight, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // User-scoped client (RLS applies) to identify the caller and read their own profile.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization")! } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse(req, { error: "You are not logged in. Please log in." }, 401);
  }

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
      const subscriptions = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: "all",
      });
      const cancelableSubscriptions = subscriptions.data.filter(
        (sub) => sub.status !== "canceled" && sub.status !== "incomplete_expired"
      );
      await Promise.all(cancelableSubscriptions.map((sub) => stripe.subscriptions.cancel(sub.id)));
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
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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
