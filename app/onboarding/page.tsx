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
    <div className="onboarding-screen">
      <div className="onboarding-card">
        <Badge color="blue">Last step</Badge>
        <h1>What JLPT level are you studying?</h1>
        <p className="explain">
          Choose the most advanced level you&apos;re studying now. Lower levels are enabled automatically — if you
          know N3, we assume you know N5/N4 too.
        </p>

        <LevelGrid value={level} onChange={setLevel} />

        <div className="onboarding-note">
          You&apos;ll study <strong>{included.slice().reverse().join(", ")}</strong>. You can change this anytime in
          Settings.
        </div>

        {error && (
          <div className="login-error show" style={{ marginBottom: 20 }}>
            <span>{error}</span>
          </div>
        )}

        <Button onClick={handleContinue} loading={submitting} style={{ width: "100%" }}>
          Continue
        </Button>
      </div>
    </div>
  );
}
