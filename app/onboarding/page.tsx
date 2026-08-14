"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { guessCountryFromTimezone } from "@/lib/timezoneCountry";
import type { JlptLevel } from "@/lib/srs/constants";
import { LevelGrid, enabledLevelsFor } from "@/app/components/ui/LevelGrid";
import { CountrySelect } from "@/app/components/ui/CountrySelect";
import { Button } from "@/app/components/ui/Button";
import { Badge } from "@/app/components/ui/Badge";
import { useToast } from "@/app/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { completeOnboarding } from "@/lib/client-data/studySettings";
import { updateCountry } from "@/lib/client-data/userProfile";

export default function OnboardingPage() {
  const [level, setLevel] = useState<JlptLevel>("N5");
  const [country, setCountry] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();
  const { user } = useAuth();
  const router = useRouter();

  const included = enabledLevelsFor(level);

  // Guessed client-side only (Intl reflects the browser's timezone, not the
  // server's) -- runs after mount so it doesn't cause a hydration mismatch.
  useEffect(() => {
    const guessed = guessCountryFromTimezone();
    if (guessed) setCountry(guessed);
  }, []);

  async function handleContinue() {
    if (!user) return;
    if (!country) {
      showToast("Please select your country.", "error");
      return;
    }
    setSubmitting(true);
    try {
      await updateCountry(user.id, country);
      await completeOnboarding(user.id, included);
      router.push("/dashboard");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong. Please try again.", "error");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-[560px] text-center">
        <Badge color="blue" className="mb-4">Last step</Badge>
        <h1 className="mb-2 text-[1.5rem] font-extrabold tracking-[-0.5px]">What JLPT level are you studying?</h1>
        <p className="mx-auto mb-6 max-w-md text-sm leading-[1.6] text-text-muted">
          Lower levels are included automatically.
        </p>

        <div className="mb-6">
          <LevelGrid value={level} onChange={setLevel} />
        </div>

        <div className="mb-6 text-left">
          <label htmlFor="onboarding-country" className="mb-2 block text-sm font-bold uppercase tracking-[0.6px] text-text-muted">
            Country
          </label>
          <CountrySelect id="onboarding-country" value={country} onChange={setCountry} placement="auto" />
        </div>

        <Button onClick={handleContinue} loading={submitting} disabled={!country} className="w-full">
          Continue
        </Button>
      </div>
    </div>
  );
}
