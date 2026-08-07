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

  let hadActiveSubscription = false;
  let stripeCustomerDeleted = false;

  if (profile?.stripe_customer_id) {
    try {
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
      const subscriptions = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id,
        status: "all",
      });
      // Only 'canceled' and 'incomplete_expired' are already-terminal states;
      // everything else still needs to be canceled, or Stripe will refuse to
      // delete a customer that has subscriptions attached.
      const cancelableSubscriptions = subscriptions.data.filter(
        (sub) => sub.status !== "canceled" && sub.status !== "incomplete_expired"
      );
      hadActiveSubscription = cancelableSubscriptions.length > 0;
      await Promise.all(cancelableSubscriptions.map((sub) => stripe.subscriptions.cancel(sub.id)));
      await stripe.customers.del(profile.stripe_customer_id);
      stripeCustomerDeleted = true;
    } catch (err) {
      return jsonResponse(
        req,
        {
          error: `Could not cancel the Stripe subscription or remove the Stripe customer before deleting the account: ${
            err instanceof Error ? err.message : "unknown error"
          }. Configure Stripe or resolve this manually before retrying.`,
        },
        500
      );
    }
  }

  // Admin (service-role) client for the actual account deletion — deleteUser requires it.
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return jsonResponse(req, { error: deleteError.message }, 500);
  }

  const { error: auditError } = await admin.from("account_deletion_log").insert({
    user_id: user.id,
    had_active_subscription: hadActiveSubscription,
    stripe_customer_deleted: stripeCustomerDeleted,
  });
  if (auditError) {
    console.error("Failed to write account_deletion_log entry:", auditError.message);
  }

  return new Response(null, { status: 204, headers: corsHeaders(req) });
});
