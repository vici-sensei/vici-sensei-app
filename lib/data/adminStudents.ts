import type { AppSupabaseClient } from "@/lib/supabase/types";
import { isMultiRegionEnabled } from "@/lib/supabase/regions";
import type { StudentRosterRow } from "@/lib/types";

/**
 * admin_get_student_roster (multi-region Phase 6) is the same shape and logic as the original
 * get_admin_student_roster (20261236/20261237), but reads from admin_all.* -- a per-table UNION
 * ALL of public.* (this project's own students) and mirror_us.* (a one-way logical-replication
 * copy of the US project's students, since the admin account only exists in EU). A SECURITY
 * DEFINER function with its own is_admin() check, not RLS -- mirror_us has no RLS policies at
 * all, so a plain (non-definer) function relying on RLS the way the original does would have let
 * any authenticated caller read a mirrored student's real data by guessing their id.
 *
 * It only exists on the new EU/US projects, not the still-live old one this app talks to while
 * NEXT_PUBLIC_MULTI_REGION is off -- so which RPC to call has to follow the same flag `createClient()`
 * already branches on, or this would 404 in production today.
 */
export async function fetchStudentRoster(supabase: AppSupabaseClient): Promise<StudentRosterRow[]> {
  if (isMultiRegionEnabled()) {
    const { data, error } = await supabase.rpc("admin_get_student_roster");
    if (error) throw new Error(error.message);
    return data as StudentRosterRow[];
  }

  // The old project's get_admin_student_roster predates Pro end dates and regions.
  const { data, error } = await supabase.rpc("get_admin_student_roster");
  if (error) throw new Error(error.message);
  return (data as Omit<StudentRosterRow, "premium_until" | "has_stripe" | "region" | "study_track">[]).map((row) => ({
    ...row,
    premium_until: null,
    has_stripe: false,
    region: null,
    study_track: null,
  }));
}

/**
 * admin_set_student_premium (multi-region only, 20260923152656/152732_premium_trial_admin_*.sql)
 * writes through to whichever project the student lives in. `premiumUntil` null = no end date;
 * ignored when turning Pro off. Refused for a student whose Pro comes from Stripe.
 */
export async function setStudentPremium(
  supabase: AppSupabaseClient,
  userId: string,
  isPremium: boolean,
  premiumUntil: string | null
): Promise<void> {
  const { error } = await supabase.rpc("admin_set_student_premium", {
    p_user_id: userId,
    p_is_premium: isPremium,
    p_premium_until: premiumUntil,
  });
  if (error) throw new Error(error.message);
}
