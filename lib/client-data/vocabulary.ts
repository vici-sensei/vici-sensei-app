"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchVocabularyDetail, fetchVocabularyList, type VocabularyListParams } from "@/lib/data/vocabulary";
import { readVocabularyListCache, writeVocabularyListCache } from "@/lib/browse/browseListCache";
import { readVocabularyDetailCache, writeVocabularyDetailCache } from "@/lib/browse/browseDetailCache";
import { readStoredLevels } from "@/lib/browse/levelsStorage";
import { createKeyedPrefetcher, createPrefetcher } from "@/lib/client-data/createPrefetcher";
import type { VocabularyDetailRow, VocabularyListResponse } from "@/lib/types";
import type { JlptLevel } from "@/lib/srs/constants";

type Status = "loading" | "loaded" | "error";

export function useVocabularyList(params: VocabularyListParams) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<VocabularyListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { search, levels, limit, offset } = params;
  const isDefaultView = !search && offset === 0 && !!levels;

  const refetch = useCallback(async () => {
    // Only show the loading state if nothing's painted yet -- a hover/focus prefetch may have
    // already hydrated the default view from cache just below, and a filter change shouldn't
    // blank out results that are about to be replaced anyway.
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const result = await fetchVocabularyList({ search, levels, limit, offset });
      setData(result);
      setStatus("loaded");
      if (isDefaultView) writeVocabularyListCache(levels as JlptLevel[], result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vocabulary.");
      setStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, JSON.stringify(levels), limit, offset]);

  useEffect(() => {
    // Instant paint from a hover/focus/touchstart prefetch of the default (no-filter) view --
    // purely provisional, refetch() right below always runs and overwrites it once the real
    // fetch resolves.
    if (isDefaultView) {
      const cached = readVocabularyListCache(levels as JlptLevel[]);
      if (cached) {
        setData(cached);
        setStatus("loaded");
      }
    }
    void refetch();
    // isDefaultView/levels are derived from params, already covered by refetch's own identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch]);

  return { data, status, error, refetch };
}

/** Fire-and-forget: called on hover/focus/touchstart of the Vocabulary tab, well before the
 * user actually navigates to /browse/vocabulary. Public data (no user scoping) -- always
 * targets the same default (no-filter) view the page renders on a fresh visit. */
export const prefetchVocabularyList = createPrefetcher(async () => {
  const levels = readStoredLevels();
  const result = await fetchVocabularyList({ search: null, levels });
  writeVocabularyListCache(levels, result);
});

export function useVocabularyDetail(id: number | null) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<VocabularyDetailRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (id == null) return;
    // Only show the loading state if nothing's painted yet -- a sustained-hover prefetch on the
    // list row may have already hydrated this exact id from cache just below.
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const result = await fetchVocabularyDetail(id);
      setData(result);
      setStatus("loaded");
      if (result) writeVocabularyDetailCache(id, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vocabulary.");
      setStatus("error");
    }
  }, [id]);

  useEffect(() => {
    // Instant paint from a sustained-hover/focus/touchstart prefetch of this row in the list --
    // purely provisional, refetch() right below always runs and overwrites it once the real
    // fetch resolves.
    if (id != null) {
      const cached = readVocabularyDetailCache(id);
      if (cached) {
        setData(cached);
        setStatus("loaded");
      }
    }
    void refetch();
  }, [id, refetch]);

  return { data, status, error, refetch };
}

/** Fire-and-forget: called after ~200ms of sustained hover (or focus/touchstart) over a
 * vocabulary row in the /browse/vocabulary list, well before the user actually clicks through
 * to its detail page. Keyed per id so prefetching one row never blocks prefetching a different
 * one. */
export const prefetchVocabularyDetail = createKeyedPrefetcher(async (id: number) => {
  const result = await fetchVocabularyDetail(id);
  if (result) writeVocabularyDetailCache(id, result);
});
