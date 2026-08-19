"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useStudySettings } from "@/lib/client-data/studySettings";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { SettingsHeader } from "@/app/components/ui/SettingsHeader";
import { StudySettingsForm } from "./StudySettingsForm";

export default function SettingsStudyPage() {
  const { user } = useAuth();
  const { data: settings, status, refetch } = useStudySettings(user);

  return (
    <div>
      <SettingsHeader
        title="Study settings"
        description="Control how many new cards you see per day and which JLPT levels are active."
      />

      {status === "loading" || !settings ? (
        <StudySettingsSkeleton />
      ) : (
        <StudySettingsForm initial={settings} onSaved={refetch} />
      )}
    </div>
  );
}

function StepperSkeleton() {
  return (
    <div className="flex items-center gap-2.5">
      <Skeleton className="h-9 w-9 rounded-lg" />
      <Skeleton className="h-5 w-15" />
      <Skeleton className="h-9 w-9 rounded-lg" />
    </div>
  );
}

function ToggleRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-5 border-b border-border-soft py-4 last:border-b-0">
      <div>
        <Skeleton className="mb-1.5 h-4 w-32" />
        <Skeleton className="h-3.5 w-56" />
      </div>
      <Skeleton className="h-[26px] w-[46px] shrink-0 rounded-full" />
    </div>
  );
}

function StudySettingsSkeleton() {
  return (
    <>
      <GlassCard padding="lg" className="mb-5.5">
        <div className="mb-[22px]">
          <Skeleton className="mb-2 h-3.5 w-36" />
          <StepperSkeleton />
          <Skeleton className="mt-2.5 h-3.5 w-72" />
        </div>
        <div>
          <Skeleton className="mb-2 h-3.5 w-44" />
          <StepperSkeleton />
        </div>
      </GlassCard>

      <GlassCard padding="lg" className="mb-5.5">
        <Skeleton className="mb-2 h-3.5 w-36" />
        <StepperSkeleton />
        <Skeleton className="mt-1.5 h-3.5 w-64" />
      </GlassCard>

      <GlassCard padding="lg" className="mb-5.5">
        <Skeleton className="mb-3.5 h-3.5 w-40" />
        <div className="flex flex-wrap justify-center gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[62px] w-[62px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-3.5 h-3.5 w-full max-w-sm" />
      </GlassCard>

      <GlassCard padding="lg">
        <ToggleRowSkeleton />
        <ToggleRowSkeleton />
      </GlassCard>
    </>
  );
}
