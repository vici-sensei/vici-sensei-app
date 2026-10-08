"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchKanjiProgress, fetchProgressSummary, fetchVocabularyProgress } from "@/lib/data/progress";
import { readCache, writeCache } from "@/lib/client-data/localCache";
import { createPrefetcher } from "@/lib/client-data/createPrefetcher";
import { useRemoteData } from "@/lib/client-data/useRemoteData";
import { getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus, KanjiProgressResponse, ProgressSummaryResponse, VocabularyProgress } from "@/lib/types";

function progressSummaryCacheKey(userId: string): string {
  return `cache:progress-summary:${userId}`;
}

/** This user's progress on one kanji. `mutate` applies an optimistic edit until `refetch` settles it. */
export function useKanjiProgress(user: User | null, kanjiId: number | null) {
  return useRemoteData<KanjiProgressResponse, { userId: string; kanjiId: number }>({
    params: user && kanjiId != null ? { userId: user.id, kanjiId } : null,
    load: (p) => fetchKanjiProgress(createClient(), p.userId, p.kanjiId),
    errorFallback: "Failed to load progress.",
  });
}

/** This user's progress on one vocabulary word. `mutate` applies an optimistic edit until `refetch` settles it. */
export function useVocabularyProgress(user: User | null, wordId: number | null) {
  return useRemoteData<VocabularyProgress | null, { userId: string; wordId: number }>({
    params: user && wordId != null ? { userId: user.id, wordId } : null,
    load: (p) => fetchVocabularyProgress(createClient(), p.userId, p.wordId),
    errorFallback: "Failed to load progress.",
  });
}

export function useProgressSummary(user: User | null) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<ProgressSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) return;
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const result = await fetchProgressSummary(createClient(), user.id);
      setData(result);
      setStatus("loaded");
      writeCache(progressSummaryCacheKey(user.id), result);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load progress."));
      setStatus("error");
    }
  }, [user]);

  useEffect(() => {
    function sync() {
      if (!user) return;
      // Instant paint from a hover/focus prefetch of the Progress nav entry (or the shell's
      // own previous visit) -- purely provisional, refetch() below always runs right after and
      // overwrites it once the real fetch resolves.
      const cached = readCache<ProgressSummaryResponse>(progressSummaryCacheKey(user.id));
      if (cached) {
        setData(cached);
        setStatus("loaded");
      }
      void refetch();
    }
    sync();
  }, [user, refetch]);

  return { data, status, error, refetch };
}

/** Fire-and-forget: called on hover/focus/touchstart of a Progress nav entry point, well
 * before the user actually navigates to /progress. Writes straight to the localStorage cache
 * useProgressSummary reads on mount. */
export const prefetchProgressSummary = createPrefetcher(async (userId: string) => {
  const result = await fetchProgressSummary(createClient(), userId);
  writeCache(progressSummaryCacheKey(userId), result);
});
