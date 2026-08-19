"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fetchKanjiProgress, fetchProgressSummary, fetchVocabularyProgress } from "@/lib/data/progress";
import { readCache, writeCache } from "@/lib/client-data/localCache";
import { createPrefetcher } from "@/lib/client-data/createPrefetcher";
import { getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus, KanjiProgressResponse, ProgressSummaryResponse, VocabularyProgress } from "@/lib/types";

function progressSummaryCacheKey(userId: string): string {
  return `cache:progress-summary:${userId}`;
}

export function useKanjiProgress(user: User | null, kanjiId: number | null) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<KanjiProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user || kanjiId == null) return;
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const result = await fetchKanjiProgress(createClient(), user.id, kanjiId);
      setData(result);
      setStatus("loaded");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load progress."));
      setStatus("error");
    }
  }, [user, kanjiId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch, mutate: setData };
}

export function useVocabularyProgress(user: User | null, wordId: number | null) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<VocabularyProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user || wordId == null) return;
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const result = await fetchVocabularyProgress(createClient(), user.id, wordId);
      setData(result);
      setStatus("loaded");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load progress."));
      setStatus("error");
    }
  }, [user, wordId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch, mutate: setData };
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
