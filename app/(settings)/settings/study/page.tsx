"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useStudySettings } from "@/lib/client-data/studySettings";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { StudySettingsForm } from "./StudySettingsForm";

export default function SettingsStudyPage() {
  const { user } = useAuth();
  const { data: settings, status, refetch } = useStudySettings(user);

  if (status === "loading" || !settings) {
    return <Skeleton className="h-96 rounded-2xl" />;
  }

  return <StudySettingsForm initial={settings} onSaved={refetch} />;
}
