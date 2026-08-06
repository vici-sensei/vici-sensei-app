"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserProfile } from "@/lib/client-data/userProfile";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { BillingPanel } from "./BillingPanel";

export default function SettingsBillingPage() {
  const { user } = useAuth();
  const { data: profile, status } = useUserProfile(user);

  if (status === "loading" || !profile || !user) {
    return <Skeleton className="h-56 rounded-2xl" />;
  }

  return <BillingPanel isPremium={profile.is_premium} userId={user.id} email={profile.email} />;
}
