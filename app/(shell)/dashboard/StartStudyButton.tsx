"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api/client";
import { setStoredSessionId } from "@/lib/study/session";
import type { StudySessionStart } from "@/lib/types";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";

export function StartStudyButton({ disabled = false }: { disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const router = useRouter();

  async function handleStart() {
    setLoading(true);
    try {
      const session = await apiPost<StudySessionStart>("/api/study/session/start");
      setStoredSessionId(session.session_id);
      router.push("/study");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not start a study session.", "error");
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <Button onClick={handleStart} loading={loading} disabled={disabled}>
        Start studying
      </Button>
    </div>
  );
}
