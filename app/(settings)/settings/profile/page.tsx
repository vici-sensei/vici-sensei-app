"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserProfileContext } from "@/lib/client-data/UserProfileContext";
import { SettingsHeader } from "@/app/components/ui/SettingsHeader";
import { ProfileSettingsForm } from "./ProfileSettingsForm";

export default function SettingsProfilePage() {
  const { user } = useAuth();
  const { profile, refetch } = useUserProfileContext();

  if (!user) return null;

  return (
    <div>
      <SettingsHeader title="Profile" />
      <ProfileSettingsForm initial={profile} userId={user.id} onSaved={refetch} />
    </div>
  );
}
