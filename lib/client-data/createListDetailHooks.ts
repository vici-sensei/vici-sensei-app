"use client";

import { useCallback, useEffect, useState } from "react";
import { createKeyedPrefetcher, createPrefetcher } from "@/lib/client-data/createPrefetcher";
import { readStoredLevels } from "@/lib/browse/levelsStorage";
import { getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus } from "@/lib/types";
import type { JlptLevel } from "@/lib/srs/constants";

interface ListParams {
  search?: string | null;
  levels?: string[] | null;
  limit?: number;
  offset?: number;
}

interface ListDetailHooksConfig<ListResponse, Params extends ListParams, Detail> {
  fetchList: (params: Params) => Promise<ListResponse>;
  fetchDetail: (id: number) => Promise<Detail | null>;
  readListCache: (levels: JlptLevel[]) => ListResponse | null;
  writeListCache: (levels: JlptLevel[], data: ListResponse) => void;
  readDetailCache: (id: number) => Detail | null;
  writeDetailCache: (id: number, data: Detail) => void;
  listErrorFallback: string;
  detailErrorFallback: string;
}

/** Shared shape behind useKanjiList/useVocabularyList and useKanjiDetail/useVocabularyDetail --
 * same status/data/error state, same "only flip to loading if not already loaded" behavior, and
 * the same instant-paint-from-cache-then-refetch effect, parametrized by each entity's fetch and
 * cache functions. */
export function createListDetailHooks<ListResponse, Params extends ListParams, Detail>(
  config: ListDetailHooksConfig<ListResponse, Params, Detail>
) {
  const {
    fetchList,
    fetchDetail,
    readListCache,
    writeListCache,
    readDetailCache,
    writeDetailCache,
    listErrorFallback,
    detailErrorFallback,
  } = config;

  function useList(params: Params) {
    const [status, setStatus] = useState<AsyncStatus>("loading");
    const [data, setData] = useState<ListResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { search, levels, limit, offset } = params;
    const isDefaultView = !search && offset === 0 && !!levels;

    const refetch = useCallback(async () => {
      // Only show the loading state if nothing's painted yet -- a hover/focus prefetch may have
      // already hydrated the default view from cache just below, and a filter change shouldn't
      // blank out results that are about to be replaced anyway.
      setStatus((prev) => (prev === "loaded" ? prev : "loading"));
      try {
        const result = await fetchList(params);
        setData(result);
        setStatus("loaded");
        if (isDefaultView) writeListCache(levels as JlptLevel[], result);
      } catch (err) {
        setError(getErrorMessage(err, listErrorFallback));
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
        const cached = readListCache(levels as JlptLevel[]);
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
   * before the user actually navigates to the list page. Public data (no user scoping) --
   * always targets the same default (no-filter) view the page renders on a fresh visit. */
  const prefetchList = createPrefetcher(async () => {
    const levels = readStoredLevels();
    const result = await fetchList({ search: null, levels } as Params);
    writeListCache(levels, result);
  });

  function useDetail(id: number | null) {
    const [status, setStatus] = useState<AsyncStatus>("loading");
    const [data, setData] = useState<Detail | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
      if (id == null) return;
      // Only show the loading state if nothing's painted yet -- a sustained-hover prefetch on the
      // list row may have already hydrated this exact id from cache just below.
      setStatus((prev) => (prev === "loaded" ? prev : "loading"));
      try {
        const result = await fetchDetail(id);
        setData(result);
        setStatus("loaded");
        if (result) writeDetailCache(id, result);
      } catch (err) {
        setError(getErrorMessage(err, detailErrorFallback));
        setStatus("error");
      }
    }, [id]);

    useEffect(() => {
      // Instant paint from a sustained-hover/focus/touchstart prefetch of this row in the list --
      // purely provisional, refetch() right below always runs and overwrites it once the real
      // fetch resolves.
      if (id != null) {
        const cached = readDetailCache(id);
        if (cached) {
          setData(cached);
          setStatus("loaded");
        }
      }
      void refetch();
    }, [id, refetch]);

    return { data, status, error, refetch };
  }

  /** Fire-and-forget: called after ~200ms of sustained hover (or focus/touchstart) over a row in
   * the list, well before the user actually clicks through to its detail page. Keyed per id so
   * prefetching one row never blocks prefetching a different one. */
  const prefetchDetail = createKeyedPrefetcher(async (id: number) => {
    const result = await fetchDetail(id);
    if (result) writeDetailCache(id, result);
  });

  return { useList, prefetchList, useDetail, prefetchDetail };
}
