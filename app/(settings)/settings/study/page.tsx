"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useStudySettings } from "@/lib/client-data/studySettings";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { StudySettingsForm } from "./StudySettingsForm";

export default function SettingsStudyPage() {
  const { user } = useAuth();
  const { data: settings, status, refetch } = useStudySettings(user);

  return (
    <div>
      <h2 className="mb-2 text-[1.7rem] font-extrabold leading-[1.2] tracking-[-0.8px]">Study settings</h2>
      <p className="mb-6.5 text-base leading-[1.6] text-text-muted">
        Control how many new cards you see per day and which JLPT levels are active.
      </p>

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
      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <div className="mb-[22px]">
          <Skeleton className="mb-2 h-3.5 w-36" />
          <StepperSkeleton />
          <Skeleton className="mt-2.5 h-3.5 w-72" />
        </div>
        <div>
          <Skeleton className="mb-2 h-3.5 w-44" />
          <StepperSkeleton />
        </div>
      </div>

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <Skeleton className="mb-2 h-3.5 w-36" />
        <StepperSkeleton />
        <Skeleton className="mt-1.5 h-3.5 w-64" />
      </div>

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <Skeleton className="mb-3.5 h-3.5 w-40" />
        <div className="flex flex-wrap justify-center gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[62px] w-[62px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-3.5 h-3.5 w-full max-w-sm" />
      </div>

      <div className="rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <ToggleRowSkeleton />
        <ToggleRowSkeleton />
      </div>
    </>
  );
}
