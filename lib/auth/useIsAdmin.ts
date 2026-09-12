"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";

export type IsAdminStatus = "loading" | "admin" | "not-admin";

/** Checks the `admin` flag on the caller's own public.users row. Kept separate from
 *  useUserProfile -- admin is an authorization flag, not editable profile data, so nav/route
 *  guards reading it don't need to wait on, or invalidate alongside, profile edits. */
export function useIsAdmin(user: User | null): IsAdminStatus {
  const [status, setStatus] = useState<IsAdminStatus>("loading");

  useEffect(() => {
    if (!user) {
      setStatus("not-admin");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    createClient()
      .from("users")
      .select("admin")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (!cancelled) setStatus(!error && data?.admin ? "admin" : "not-admin");
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return status;
}
