import Stripe from "npm:stripe@22";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handlePreflight, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

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

  const body = await req.json().catch(() => ({}));
  const returnUrl = typeof body.return_url === "string" && body.return_url.length > 0 ? body.return_url : null;

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (profileError) return jsonResponse(req, { error: profileError.message }, 500);
  if (!profile.stripe_customer_id) {
    return jsonResponse(req, { error: "This account has no Stripe billing profile yet." }, 400);
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl ?? `${Deno.env.get("APP_ORIGIN")}/dashboard`,
    });
    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    return jsonResponse(
      req,
      { error: err instanceof Error ? err.message : "Stripe portal session creation failed." },
      500
    );
  }
});
