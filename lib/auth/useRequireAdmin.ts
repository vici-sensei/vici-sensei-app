"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useIsAdmin } from "./useIsAdmin";

/** For pages nested under a layout that already guarantees a session (e.g. (shell), gated by
 *  useRequireOnboarded) -- redirects to /dashboard if the signed-in user isn't an admin. */
export function useRequireAdmin() {
  const { user } = useAuth();
  const status = useIsAdmin(user);
  const router = useRouter();

  useEffect(() => {
    if (status === "not-admin") router.replace("/dashboard");
  }, [status, router]);

  return { ready: status === "admin", checking: status === "loading" };
}
