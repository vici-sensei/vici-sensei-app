"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "./useRequireAuth";
import { useStudySettings } from "@/lib/client-data/studySettings";

/** Layer 2 on top of useRequireAuth: also requires onboarding to be complete, redirecting to /onboarding otherwise. */
export function useRequireOnboarded() {
  const { ready: authReady, user } = useRequireAuth();
  const { data: settings, status } = useStudySettings(authReady ? user : null);
  const router = useRouter();

  useEffect(() => {
    if (authReady && status === "loaded" && (!settings || !settings.onboarding_completed)) {
      router.replace("/onboarding");
    }
  }, [authReady, status, settings, router]);

  const onboarded = !!settings?.onboarding_completed;
  return {
    ready: authReady && status === "loaded" && onboarded,
    checking: !authReady || status === "loading",
    user,
    settings,
  };
}
