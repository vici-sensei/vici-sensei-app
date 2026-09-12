"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchFreeLessonLeads } from "@/lib/data/freeLessonLeads";
import { getErrorMessage } from "@/lib/api/client";
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
