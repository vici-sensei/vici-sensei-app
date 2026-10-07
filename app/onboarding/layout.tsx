"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { leaveIfAccountMoved } from "@/lib/auth/leaveIfAccountMoved";
import { useStudySettings } from "@/lib/client-data/studySettings";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { AccountUnavailable } from "./AccountUnavailable";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { ready: authReady, user } = useRequireAuth();
  const { data: settings, status } = useStudySettings(authReady ? user : null);
  const router = useRouter();
  const [unavailable, setUnavailable] = useState(false);
  // Loaded, yet no row: fetchStudySettings reports a missing row as null, not as an error. The
  // wizard waits for a row to resume from, so rendering it here would be a loader that never ends.
  const rowMissing = authReady && status === "loaded" && !settings;

  useEffect(() => {
    if (status === "loaded" && settings?.onboarding_completed) {
      router.replace("/dashboard");
    }
  }, [status, settings, router]);

  // Normally already handled by useRequireOnboarded on the way here, but /onboarding can also be
  // opened directly (bookmark, a stale tab) -- see leaveIfAccountMoved for what a missing row means.
  useEffect(() => {
    if (!rowMissing) return;
    let cancelled = false;
    void leaveIfAccountMoved().then((moved) => {
      if (!cancelled && !moved) setUnavailable(true);
    });
    return () => {
      cancelled = true;
    };
  }, [rowMissing]);

  if (rowMissing) return unavailable ? <AccountUnavailable /> : <FullScreenLoader />;

  if (!authReady || status === "loading" || settings?.onboarding_completed) {
    return <FullScreenLoader />;
  }

  return <>{children}</>;
}
