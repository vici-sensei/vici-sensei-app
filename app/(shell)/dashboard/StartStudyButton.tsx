"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { prefetchFirstDueCard } from "@/lib/client-data/study";
import { prefetchKanaExtendedRomaji } from "@/lib/client-data/kana";
import { useStudySettingsContext } from "@/lib/client-data/StudySettingsContext";
import { clearStoredSessionId } from "@/lib/study/session";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/app/components/ui/Button";

export function StartStudyButton({ disabled = false }: { disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  // Not a hard dependency: settings can still be loading, in which case nothing extra is prefetched.
  const extendedRomajiEnabled = useStudySettingsContext().data?.extended_romaji_enabled ?? false;

  function handleIntent() {
    if (user) prefetchFirstDueCard(user.id);
    if (extendedRomajiEnabled) prefetchKanaExtendedRomaji();
  }

  function handleStart() {
    // The shell layout only renders this button once the user is confirmed authed.
    if (!user) return;
    setLoading(true);
    // No study_sessions row is created here: /study starts one itself only once its queue is
    // confirmed non-empty (see ensureSession in useStudyQueue), so a click that finds nothing to
    // study never leaves an empty session behind. Clearing the stored id keeps "every click is a
    // fresh session" -- the old startSession call always overwrote whatever a previous, abandoned
    // visit (the X button doesn't end its session) had left in sessionStorage.
    clearStoredSessionId(user.id);
    router.push("/study");
  }

  return (
    <div className="w-full text-center sm:w-auto sm:text-left">
      <Button
        onClick={handleStart}
        onMouseEnter={handleIntent}
        onFocus={handleIntent}
        onTouchStart={handleIntent}
        loading={loading}
        disabled={disabled}
      >
        Start studying
      </Button>
    </div>
  );
}
