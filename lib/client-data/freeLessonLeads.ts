"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { isMultiRegionEnabled } from "@/lib/supabase/regions";
import { fetchFreeLessonLeads } from "@/lib/data/freeLessonLeads";
import { ApiError, getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus, FreeLessonLead } from "@/lib/types";

export function useFreeLessonLeads(user: User | null) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<FreeLessonLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) return;
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const leads = await fetchFreeLessonLeads(createClient());
      setData(leads);
      setStatus("loaded");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load leads."));
      setStatus("error");
    }
  }, [user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch };
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
