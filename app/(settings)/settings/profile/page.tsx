"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserProfileContext } from "@/lib/client-data/UserProfileContext";
import { SettingsHeader } from "@/app/components/ui/SettingsHeader";
import { ProfileSettingsForm } from "./ProfileSettingsForm";
import { BadgesSection } from "./BadgesSection";

export default function SettingsProfilePage() {
  const { user } = useAuth();
  const { profile, loaded, refetch } = useUserProfileContext();

  if (!user) return null;

  return (
    <div>
      <SettingsHeader title="Profile" />
      {/* Keyed on load state so the form remounts (and its local state resets from the
          placeholder to the real row) the one time loading actually finishes -- background
          refetches after that keep `loaded` at true and don't re-key. */}
      <ProfileSettingsForm key={loaded ? "loaded" : "loading"} initial={profile} userId={user.id} loading={!loaded} onSaved={refetch} />
      <div className="mt-5.5">
        <BadgesSection userId={user.id} />
      </div>
    </div>
  );
}
