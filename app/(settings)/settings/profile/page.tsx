"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserProfileContext } from "@/lib/client-data/UserProfileContext";
import { ProfileSettingsForm } from "./ProfileSettingsForm";

export default function SettingsProfilePage() {
  const { user } = useAuth();
  const { profile, refetch } = useUserProfileContext();

  if (!user) return null;

  return (
    <div>
      <h2 className="mb-6.5 text-[1.7rem] font-extrabold leading-[1.2] tracking-[-0.8px]">Profile</h2>
      <ProfileSettingsForm initial={profile} userId={user.id} onSaved={refetch} />
    </div>
  );
}
