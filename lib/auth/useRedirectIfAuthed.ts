"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * For /login and /signup: someone who already has a session goes straight to /dashboard. `busy` holds
 * that redirect back while the page is itself finishing a sign-in (a session appears a moment before
 * finishSignIn() has decided whether the account may continue), and lets it run again once the page is
 * idle. Returns the auth status so the page can show a loader instead of the form meanwhile.
 */
export function useRedirectIfAuthed(busy = false) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authed" && !busy) router.replace("/dashboard");
  }, [status, busy, router]);

  return status;
}
