"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api/client";
import { setStoredSessionId } from "@/lib/study/session";
import type { StudySessionStart } from "@/lib/types";
import { Button } from "@/app/components/ui/Button";

export function StartStudyButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      const session = await apiPost<StudySessionStart>("/api/study/session/start");
      setStoredSessionId(session.session_id);
      router.push("/study");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start a study session.");
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <Button onClick={handleStart} loading={loading}>
        Start studying
      </Button>
      {error && <p className="subtitle mt-2.5 text-accent-red">{error}</p>}
    </div>
  );
}
