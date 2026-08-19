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
  const { profile } = useUserProfileContext();

  return (
    <div>
      <SettingsHeader title="Billing" description="Manage your Vici Sensei Premium subscription." />

      {!profile || !user ? (
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

// Which of the three states (free / premium via Stripe / premium via mentorship, no
// Stripe customer) this resolves to is genuinely unknown until the profile loads, so this
// approximates the shared shape (a status label, 1-3 lines of copy, and at most one action)
// rather than committing to any one branch's exact layout.
function BillingSkeleton() {
  return (
    <GlassCard padding="lg" className="mb-5.5">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0 flex-1">
          <Skeleton className="mb-3 h-6 w-28 rounded-full" />
          <Skeleton className="mb-1.5 h-4 w-full max-w-sm" />
          <Skeleton className="h-4 w-2/3 max-w-xs" />
        </div>
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-11 w-32 rounded-xl" />
        </div>
      </div>
    </GlassCard>
  );
}
