"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchKanjiDetail, fetchKanjiList, type KanjiListParams } from "@/lib/data/kanji";
import { readKanjiListCache, writeKanjiListCache } from "@/lib/browse/browseListCache";
import { readKanjiDetailCache, writeKanjiDetailCache } from "@/lib/browse/browseDetailCache";
import { readStoredLevels } from "@/lib/browse/levelsStorage";
import { createKeyedPrefetcher, createPrefetcher } from "@/lib/client-data/createPrefetcher";
import type { KanjiDetail, KanjiListResponse } from "@/lib/types";
import type { JlptLevel } from "@/lib/srs/constants";

type Status = "loading" | "loaded" | "error";

export function useKanjiList(params: KanjiListParams) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<KanjiListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { search, levels, limit, offset } = params;
  const isDefaultView = !search && offset === 0 && !!levels;

  const refetch = useCallback(async () => {
    // Only show the loading state if nothing's painted yet -- a hover/focus prefetch may have
    // already hydrated the default view from cache just below, and a filter change shouldn't
    // blank out results that are about to be replaced anyway.
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const result = await fetchKanjiList({ search, levels, limit, offset });
      setData(result);
      setStatus("loaded");
      if (isDefaultView) writeKanjiListCache(levels as JlptLevel[], result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load kanji.");
      setStatus("error");
    }
    // levels is an array — compared by contents via JSON below, not identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, JSON.stringify(levels), limit, offset]);

  useEffect(() => {
    // Instant paint from a hover/focus/touchstart prefetch of the default (no-filter) view --
    // purely provisional, refetch() right below always runs and overwrites it once the real
    // fetch resolves.
    if (isDefaultView) {
      const cached = readKanjiListCache(levels as JlptLevel[]);
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

/** Fire-and-forget: called on hover/focus/touchstart of an Explore nav entry point, well
 * before the user actually navigates to /browse/kanji. Public data (no user scoping) --
 * always targets the same default (no-filter) view the page renders on a fresh visit. */
export const prefetchKanjiList = createPrefetcher(async () => {
  const levels = readStoredLevels();
  const result = await fetchKanjiList({ search: null, levels });
  writeKanjiListCache(levels, result);
});

export function useKanjiDetail(id: number | null) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<KanjiDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (id == null) return;
    // Only show the loading state if nothing's painted yet -- a sustained-hover prefetch on the
    // list row may have already hydrated this exact id from cache just below.
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const result = await fetchKanjiDetail(id);
      setData(result);
      setStatus("loaded");
      if (result) writeKanjiDetailCache(id, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load kanji.");
      setStatus("error");
    }
  }, [id]);

  useEffect(() => {
    // Instant paint from a sustained-hover/focus/touchstart prefetch of this row in the list --
    // purely provisional, refetch() right below always runs and overwrites it once the real
    // fetch resolves.
    if (id != null) {
      const cached = readKanjiDetailCache(id);
      if (cached) {
        setData(cached);
        setStatus("loaded");
      }
    }
    void refetch();
  }, [id, refetch]);

  return { data, status, error, refetch };
}

/** Fire-and-forget: called after ~200ms of sustained hover (or focus/touchstart) over a kanji
 * row in the /browse/kanji list, well before the user actually clicks through to its detail
 * page. Keyed per id so prefetching one row never blocks prefetching a different one. */
export const prefetchKanjiDetail = createKeyedPrefetcher(async (id: number) => {
  const result = await fetchKanjiDetail(id);
  if (result) writeKanjiDetailCache(id, result);
});
