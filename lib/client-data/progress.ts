"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchKanjiProgress, fetchProgressSummary, fetchVocabularyProgress } from "@/lib/data/progress";
import type { KanjiProgressResponse, ProgressSummaryResponse, VocabularyProgress } from "@/lib/types";

type Status = "loading" | "loaded" | "error";

export function useKanjiProgress(user: User | null, kanjiId: number | null) {
  const [status, setStatus] = useState<Status>("loading");
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
      setError(err instanceof Error ? err.message : "Failed to load progress.");
      setStatus("error");
    }
  }, [user, kanjiId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch, mutate: setData };
}

export function useVocabularyProgress(user: User | null, wordId: number | null) {
  const [status, setStatus] = useState<Status>("loading");
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
      setError(err instanceof Error ? err.message : "Failed to load progress.");
      setStatus("error");
    }
  }, [user, wordId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch, mutate: setData };
}

export function useProgressSummary(user: User | null) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<ProgressSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) return;
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const result = await fetchProgressSummary(createClient(), user.id);
      setData(result);
      setStatus("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load progress.");
      setStatus("error");
    }
  }, [user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch };
}
