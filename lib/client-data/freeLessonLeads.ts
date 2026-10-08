"use client";

import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { isMultiRegionEnabled } from "@/lib/supabase/regions";
import { fetchFreeLessonLeads } from "@/lib/data/freeLessonLeads";
import { ApiError } from "@/lib/api/client";
import { useRemoteData } from "@/lib/client-data/useRemoteData";

export function useFreeLessonLeads(user: User | null) {
  return useRemoteData({
    params: user?.id ?? null,
    load: () => fetchFreeLessonLeads(createClient()),
    errorFallback: "Failed to load leads.",
  });
}

/**
 * admin_update_lead_contacted (multi-region only) writes through to whichever project the lead
 * actually lives in -- a plain local `.update()` only ever touches this project's own
 * free_lesson_leads, which silently no-ops for a lead mirrored in from the other region (see
 * fetchFreeLessonLeads).
 */
export async function updateLeadContacted(leadId: number, contacted: boolean): Promise<void> {
  const supabase = createClient();
  if (isMultiRegionEnabled()) {
    const { error } = await supabase.rpc("admin_update_lead_contacted", { p_lead_id: leadId, p_contacted: contacted });
    if (error) throw new ApiError(500, error.message);
    return;
  }
  const { error } = await supabase.from("free_lesson_leads").update({ contacted }).eq("id", leadId);
  if (error) throw new ApiError(500, error.message);
}
