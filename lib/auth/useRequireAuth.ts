"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

/** Redirects to /login once we've confirmed there's no session. Renders nothing itself — callers show a loader while `checking` is true. */
export function useRequireAuth() {
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anon") router.replace("/login");
  }, [status, router]);

  return { ready: status === "authed", checking: status === "loading", user };
}
