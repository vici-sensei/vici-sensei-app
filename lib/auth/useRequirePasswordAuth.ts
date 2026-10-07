"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isPasswordAuthEnabled } from "@/lib/auth/passwordAuth";

/**
 * Guard for the pages that only exist once NEXT_PUBLIC_PASSWORD_AUTH is on (sign up, forgot / reset
 * password, the code page): with the flag off they send the visitor to /login. Returns whether the
 * flag is on, so the page can show a loader instead of flashing its content while the redirect runs.
 */
export function useRequirePasswordAuth(): boolean {
  const router = useRouter();
  const enabled = isPasswordAuthEnabled();

  useEffect(() => {
    if (!enabled) router.replace("/login");
  }, [enabled, router]);

  return enabled;
}
