"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useUserProfile } from "@/lib/client-data/userProfile";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { ProfileSettingsForm } from "./ProfileSettingsForm";

export default function SettingsProfilePage() {
  const { user } = useAuth();
  const { data: profile, status, refetch } = useUserProfile(user);

  if (status === "loading" || !profile || !user) {
    return <ProfileSkeleton />;
  }

  return <ProfileSettingsForm initial={profile} userId={user.id} onSaved={refetch} />;
}

function ProfileSkeleton() {
  return (
    <div>
      <Skeleton className="mb-2 h-9 w-36" />
      <Skeleton className="mb-6.5 h-5 w-full max-w-md" />

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <div className="mb-6.5 flex flex-col items-center gap-4 md:flex-row md:gap-5">
          <Skeleton className="h-40 w-40 shrink-0 rounded-2xl" />
          <div className="w-full md:flex-1">
            <Skeleton className="mb-2 h-3.5 w-20" />
            <Skeleton className="h-[46px] w-full rounded-lg" />
            <Skeleton className="mt-1.5 h-3 w-28" />
          </div>
        </div>
        <div>
          <Skeleton className="mb-2 h-3.5 w-14" />
          <Skeleton className="h-[46px] w-full rounded-lg" />
          <Skeleton className="mt-1.5 h-3 w-64" />
        </div>
      </div>

      <div className="mt-7 flex items-center justify-end border-t border-border-soft pt-[22px]">
        <Skeleton className="h-11 w-36 rounded-lg" />
      </div>
    </div>
  );
}
