"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchKanjiDetail, fetchKanjiList, type KanjiListParams } from "@/lib/data/kanji";
import type { KanjiDetail, KanjiListResponse } from "@/lib/types";

type Status = "loading" | "loaded" | "error";

export function useKanjiList(params: KanjiListParams) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<KanjiListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { search, levels, limit, offset } = params;

  const refetch = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await fetchKanjiList({ search, levels, limit, offset });
      setData(result);
      setStatus("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load kanji.");
      setStatus("error");
    }
    // levels is an array — compared by contents via JSON below, not identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, JSON.stringify(levels), limit, offset]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch };
}

export function useKanjiDetail(id: number | null) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<KanjiDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (id == null) return;
    setStatus("loading");
    try {
      const result = await fetchKanjiDetail(id);
      setData(result);
      setStatus("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load kanji.");
      setStatus("error");
    }
  }, [id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch };
}
