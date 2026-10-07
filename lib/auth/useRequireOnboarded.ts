"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "./useRequireAuth";
import { useStudySettings } from "@/lib/client-data/studySettings";
import { leaveIfAccountMoved } from "./leaveIfAccountMoved";

/** Layer 2 on top of useRequireAuth: also requires onboarding to be complete, redirecting to /onboarding otherwise. */
export function useRequireOnboarded() {
  const { ready: authReady, user } = useRequireAuth();
  const { data: settings, status, error, refetch } = useStudySettings(authReady ? user : null);
  const router = useRouter();

  useEffect(() => {
    if (!authReady || status !== "loaded" || settings?.onboarding_completed) return;
    if (settings) {
      router.replace("/onboarding");
      return;
    }
    // No row at all (`status` is still "loaded": fetchStudySettings reports a missing row as null,
    // not as an error). Every account is created with one, so this is a row hidden from this
    // session -- typically a stale session for an account that was moved to the other region, which
    // /onboarding could never complete. Sign that out first; anything else still goes to
    // /onboarding, which says the account is unavailable instead of showing a wizard.
    let cancelled = false;
    void leaveIfAccountMoved().then((moved) => {
      if (!cancelled && !moved) router.replace("/onboarding");
    });
    return () => {
      cancelled = true;
    };
  }, [authReady, status, settings, router]);

  const onboarded = !!settings?.onboarding_completed;
  return {
    ready: authReady && status === "loaded" && onboarded,
    checking: !authReady || status === "loading",
    // Exposed separately from `ready` so callers can kick off other user-scoped fetches (e.g.
    // the profile) as soon as we have a confirmed user, in parallel with the settings fetch
    // above, instead of waiting for settings + onboarding to resolve first.
    authReady,
    user,
    settings,
    // Exposed so the (shell)/(settings) layouts can feed this same fetch into
    // StudySettingsProvider instead of every descendant (NavBar, browse tabs, the study
    // settings page, etc.) calling useStudySettings again for the identical row.
    status,
    error,
    refetch,
  };
}
