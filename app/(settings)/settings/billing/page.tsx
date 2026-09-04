import { redirect } from "next/navigation";

// Billing is disabled for now -- kept in place (BillingPanel, client-data/billing,
// the Stripe supabase functions) but no longer reachable from the UI.
export default function SettingsBillingPage() {
  redirect("/dashboard");
}
