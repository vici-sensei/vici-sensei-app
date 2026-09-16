"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchVocabularyShortMeanings } from "@/lib/data/vocabularyShortMeanings";
import { ApiError, getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus, VocabularyShortMeaningRow } from "@/lib/types";

export function useVocabularyShortMeanings(user: User | null) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<VocabularyShortMeaningRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) return;
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const rows = await fetchVocabularyShortMeanings(createClient());
      setData(rows);
      setStatus("loaded");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load vocabulary rows."));
      setStatus("error");
    }
  }, [user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch };
}

export async function updateVocabularyShortMeaning(id: number, shortMeaning: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("vocabulary")
    .update({ short_meaning: shortMeaning })
    .eq("id", id);
  if (error) throw new ApiError(500, error.message);
}
