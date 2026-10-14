"use client";

import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchAllWords } from "@/lib/data/adminWords";
import { useRemoteData } from "@/lib/client-data/useRemoteData";

export function useAllWords(user: User | null) {
  return useRemoteData({
    params: user?.id ?? null,
    load: () => fetchAllWords(createClient()),
    errorFallback: "Failed to load words.",
  });
}
