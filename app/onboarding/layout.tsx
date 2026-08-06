"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { useStudySettings } from "@/lib/client-data/studySettings";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { ready: authReady, user } = useRequireAuth();
  const { data: settings, status } = useStudySettings(authReady ? user : null);
  const router = useRouter();

  useEffect(() => {
    if (status === "loaded" && settings?.onboarding_completed) {
      router.replace("/dashboard");
    }
  }, [status, settings, router]);

  if (!authReady || status === "loading" || settings?.onboarding_completed) {
    return <FullScreenLoader />;
  }

  return <>{children}</>;
}
