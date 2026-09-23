import type { AppSupabaseClient } from "@/lib/supabase/types";
import { isMultiRegionEnabled } from "@/lib/supabase/regions";
import type { FreeLessonLead } from "@/lib/types";

/**
 * admin_get_free_lesson_leads (20260923044546_admin_leads_mirror_and_student_region_eu.sql) reads
 * admin_all.free_lesson_leads -- the same cross-region union every other admin_get_student_* RPC
 * already reads, extended to this table so a lead that landed in the OTHER region's project isn't
 * invisible depending on which region the admin's client currently points at. Only exists on the
 * new EU/US projects, hence the same NEXT_PUBLIC_MULTI_REGION branch every other admin fetcher uses.
 */
export async function fetchFreeLessonLeads(supabase: AppSupabaseClient): Promise<FreeLessonLead[]> {
  if (isMultiRegionEnabled()) {
    const { data, error } = await supabase.rpc("admin_get_free_lesson_leads");
    if (error) throw new Error(error.message);
    return data as FreeLessonLead[];
  }

  const { data, error } = await supabase
    .from("free_lesson_leads")
    .select("id, name, whatsapp, consent, contacted, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}
