"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserProfileContext } from "@/lib/client-data/UserProfileContext";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { SettingsHeader } from "@/app/components/ui/SettingsHeader";
import { BillingPanel } from "./BillingPanel";

export default function SettingsBillingPage() {
  const { user } = useAuth();
  // Reuses the profile (settings)/layout.tsx already fetched -- see UserProfileContext --
  // instead of firing a third independent fetch on top of the layout's and profile page's own.
  const { profile, loaded } = useUserProfileContext();

  return (
    <div>
      <SettingsHeader title="Billing" description="Manage your Vici Sensei Premium subscription." />

      {!loaded || !user ? (
        <BillingSkeleton />
      ) : (
        <BillingPanel
          isPremium={profile.is_premium}
          hasStripeCustomer={Boolean(profile.stripe_customer_id)}
          userId={user.id}
          email={profile.email}
        />
      )}
    </div>
  );
}

// Mirrors the "Premium active" (mentorship, no Stripe customer) branch of BillingPanel --
// a plain status label plus a paragraph, no action button -- since that's the settled layout.
function BillingSkeleton() {
  return (
    <GlassCard padding="lg" className="mb-5.5">
      <Skeleton className="mb-2.5 h-5 w-40" />
      <Skeleton className="mb-1.5 h-4 w-full" />
      <Skeleton className="mb-1.5 h-4 w-full" />
      <Skeleton className="h-4 w-2/3 max-w-[11rem]" />
    </GlassCard>
  );
}
