"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { JlptLevel } from "@/lib/srs/constants";
import { LevelGrid, enabledLevelsFor } from "@/app/components/ui/LevelGrid";
import { Button } from "@/app/components/ui/Button";
import { Badge } from "@/app/components/ui/Badge";
import { useToast } from "@/app/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { completeOnboarding } from "@/lib/client-data/studySettings";

export default function OnboardingPage() {
  const [level, setLevel] = useState<JlptLevel>("N5");
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();
  const { user } = useAuth();
  const router = useRouter();

  const included = enabledLevelsFor(level);

  async function handleContinue() {
    if (!user) return;
    setSubmitting(true);
    try {
      await completeOnboarding(user.id, included);
      router.push("/dashboard");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong. Please try again.", "error");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-[60px]">
      <div className="w-full max-w-[560px] text-center">
        <Badge color="blue" className="mb-5">Last step</Badge>
        <h1 className="mb-3.5 text-[2.1rem] font-extrabold tracking-[-1px]">What JLPT level are you studying?</h1>
        <p className="mx-auto mb-9 max-w-md text-base leading-[1.6] text-text-muted">
          Choose the most advanced level you&apos;re studying now. Lower levels are enabled automatically — if you
          know N3, we assume you know N5/N4 too.
        </p>

        <LevelGrid value={level} onChange={setLevel} />

        <div className="mb-8 mt-3.5 rounded-lg border border-border-soft bg-white/[0.03] px-4 py-3 text-sm text-text-muted">
          You&apos;ll study <strong className="text-white">{included.slice().reverse().join(", ")}</strong>. You can change this anytime in
          Settings.
        </div>

        <Button onClick={handleContinue} loading={submitting} className="w-full">
          Continue
        </Button>
      </div>
    </div>
  );
}
