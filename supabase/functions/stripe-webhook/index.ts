import Stripe from "npm:stripe@22";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Stripe's Node SDK's `constructEvent` is sync and relies on Node's `crypto` module
// internals that aren't present in Deno's runtime — `constructEventAsync` uses
// SubtleCrypto instead and is the supported path for non-Node runtimes.
async function verifyStripeEvent(body: string, signature: string, secret: string): Promise<Stripe.Event> {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
  return stripe.webhooks.constructEventAsync(body, signature, secret);
}

Deno.serve(async (req) => {
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    return new Response("STRIPE_WEBHOOK_SECRET is not set.", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header.", { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await verifyStripeEvent(body, signature, webhookSecret);
  } catch (err) {
    return new Response(`Invalid Stripe signature: ${err instanceof Error ? err.message : "unknown error"}`, {
      status: 400,
    });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      if (userId && customerId) {
        await admin.from("users").update({ is_premium: true, stripe_customer_id: customerId }).eq("id", userId);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      await admin.from("users").update({ is_premium: false }).eq("stripe_customer_id", customerId);
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (customerId) {
        await admin.from("users").update({ is_premium: false }).eq("stripe_customer_id", customerId);
      }
      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
