"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserProfile } from "@/lib/client-data/userProfile";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { BillingPanel } from "./BillingPanel";

export default function SettingsBillingPage() {
  const { user } = useAuth();
  const { data: profile, status } = useUserProfile(user);

  if (status === "loading" || !profile || !user) {
    return <BillingSkeleton />;
  }

  return <BillingPanel isPremium={profile.is_premium} userId={user.id} email={profile.email} />;
}

function BillingSkeleton() {
  return (
    <div>
      <Skeleton className="mb-2 h-9 w-28" />
      <Skeleton className="mb-6.5 h-5 w-full max-w-xs" />

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0 flex-1">
            <Skeleton className="mb-3 h-6 w-28 rounded-full" />
            <Skeleton className="mb-1.5 h-4 w-full max-w-sm" />
            <Skeleton className="h-4 w-2/3 max-w-xs" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-11 w-32 rounded-xl" />
            <Skeleton className="h-11 w-32 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
