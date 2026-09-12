import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { FreeLessonLead } from "@/lib/types";

export async function fetchFreeLessonLeads(supabase: AppSupabaseClient): Promise<FreeLessonLead[]> {
  const { data, error } = await supabase
    .from("free_lesson_leads")
    .select("id, name, whatsapp, consent, contacted, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}
