"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserProfile } from "@/lib/client-data/userProfile";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { ProfileSettingsForm } from "./ProfileSettingsForm";

export default function SettingsProfilePage() {
  const { user } = useAuth();
  const { data: profile, status, refetch } = useUserProfile(user);

  if (status === "loading" || !profile || !user) {
    return <Skeleton className="h-96 rounded-2xl" />;
  }

  return <ProfileSettingsForm initial={profile} userId={user.id} onSaved={refetch} />;
}
