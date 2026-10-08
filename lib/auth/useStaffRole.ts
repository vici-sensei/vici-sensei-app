"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./AuthProvider";

export type StaffRole = "loading" | "admin" | "teacher" | "none";

/** What the caller's own public.users row says they are: an admin, a teacher, or neither (an admin who
 * also teaches counts as an admin: the admin panel covers everything the teachers' one does). Only
 * decides what to show -- every action is checked again on the server. */
export function useStaffRole(user: User | null): StaffRole {
  const [state, setState] = useState<{ userId: string | null; role: StaffRole }>({ userId: null, role: "loading" });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    createClient()
      .from("users")
      .select("admin,is_teacher")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        const role: StaffRole = error || !data ? "none" : data.admin ? "admin" : data.is_teacher ? "teacher" : "none";
        setState({ userId: user.id, role });
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return "none";
  return state.userId === user.id ? state.role : "loading";
}

/** For the teachers' page: sends anybody who is neither a teacher nor an admin to the dashboard. */
export function useRequireStaff() {
  const { user } = useAuth();
  const role = useStaffRole(user);
  const router = useRouter();

  useEffect(() => {
    if (role === "none") router.replace("/dashboard");
  }, [role, router]);

  return { role: role === "admin" || role === "teacher" ? role : null, checking: role === "loading" };
}
