"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchVocabularyDetail, fetchVocabularyList, type VocabularyListParams } from "@/lib/data/vocabulary";
import type { VocabularyDetailRow, VocabularyListResponse } from "@/lib/types";

type Status = "loading" | "loaded" | "error";

export function useVocabularyList(params: VocabularyListParams) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<VocabularyListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { search, levels, limit, offset } = params;

  const refetch = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await fetchVocabularyList({ search, levels, limit, offset });
      setData(result);
      setStatus("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vocabulary.");
      setStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, JSON.stringify(levels), limit, offset]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch };
}

export function useVocabularyDetail(id: number | null) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<VocabularyDetailRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (id == null) return;
    setStatus("loading");
    try {
      const result = await fetchVocabularyDetail(id);
      setData(result);
      setStatus("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vocabulary.");
      setStatus("error");
    }
  }, [id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch };
}
