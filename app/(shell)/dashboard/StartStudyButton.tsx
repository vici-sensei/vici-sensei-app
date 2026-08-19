"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { startSession } from "@/lib/client-data/study";
import { setStoredSessionId } from "@/lib/study/session";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";

export function StartStudyButton({ disabled = false }: { disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const router = useRouter();
  const { user } = useAuth();

  async function handleStart() {
    // The shell layout only renders this button once the user is confirmed authed.
    if (!user) return;
    setLoading(true);
    try {
      const session = await startSession(user.id);
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
