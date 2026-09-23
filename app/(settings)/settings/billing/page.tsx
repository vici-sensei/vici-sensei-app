"use client";

import { useUserProfileContext } from "@/lib/client-data/UserProfileContext";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { SettingsHeader } from "@/app/components/ui/SettingsHeader";
import { BillingPanel } from "./BillingPanel";

export default function SettingsBillingPage() {
  // Reuses the profile (settings)/layout.tsx already fetched -- see UserProfileContext.
  const { profile, loaded } = useUserProfileContext();

  return (
    <div>
      <SettingsHeader title="Courses" description="Your Vici Sensei Pro access." />

      {!loaded ? <BillingSkeleton /> : <BillingPanel user={profile} />}
    </div>
  );
}

// Mirrors BillingPanel's free-plan layout (status label, paragraph, courses button) -- by far the
// most common one, since Pro comes with enrolling in the courses.
function BillingSkeleton() {
  return (
    <GlassCard padding="lg" className="mb-5.5">
      <Skeleton className="mb-3.5 h-6 w-24 rounded-full" />
      <Skeleton className="mb-1.5 h-4 w-full" />
      <Skeleton className="mb-5 h-4 w-2/3" />
      <Skeleton className="h-[52px] w-52 rounded-xl" />
    </GlassCard>
  );
}
