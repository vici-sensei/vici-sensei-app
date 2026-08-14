"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserProfile } from "@/lib/client-data/userProfile";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { BillingPanel } from "./BillingPanel";

export default function SettingsBillingPage() {
  const { user } = useAuth();
  const { data: profile, status } = useUserProfile(user);

  return (
    <div>
      <h2 className="mb-2 text-[1.7rem] font-extrabold leading-[1.2] tracking-[-0.8px]">Billing</h2>
      <p className="mb-6.5 text-base leading-[1.6] text-text-muted">Manage your Vici Sensei Premium subscription.</p>

      {status === "loading" || !profile || !user ? (
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
    <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
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
    </div>
  );
}
