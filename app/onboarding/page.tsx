"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { JlptLevel } from "@/lib/srs/constants";
import { LevelGrid, enabledLevelsFor } from "@/app/components/ui/LevelGrid";
import { Button } from "@/app/components/ui/Button";
import { Badge } from "@/app/components/ui/Badge";
import { apiPost, ApiError } from "@/lib/api/client";
import type { StudySettings } from "@/lib/types";

export default function OnboardingPage() {
  const [level, setLevel] = useState<JlptLevel>("N5");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const included = enabledLevelsFor(level);

  async function handleContinue() {
    setSubmitting(true);
    setError(null);
    try {
      await apiPost<StudySettings>("/api/onboarding/complete", { enabled_levels: included });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
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

        {error && (
          <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-accent-red/30 bg-accent-red/[0.08] px-4 py-3.5 text-left text-[0.88rem] text-rose-200">
            <span>{error}</span>
          </div>
        )}

        <Button onClick={handleContinue} loading={submitting} className="w-full">
          Continue
        </Button>
      </div>
    </div>
  );
}
