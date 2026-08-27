"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllHiragana, fetchAllKatakana } from "@/lib/data/kana";
import { readCache, writeCache } from "@/lib/client-data/localCache";
import { createPrefetcher } from "@/lib/client-data/createPrefetcher";
import { getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus, BrowseKanaEntry } from "@/lib/types";

// v2: bumped when BrowseKanaEntry gained kana_type/entry_kind/etc (20260903_kana_orthography_rules.sql)
// -- old cached rows lack those fields, and partitioning logic in BrowseKanaListPage would
// silently drop them (undefined !== "character") until the background refetch overwrites them.
const HIRAGANA_CACHE_KEY = "cache:hiragana-list:v2";
const KATAKANA_CACHE_KEY = "cache:katakana-list:v2";

/** Loads the whole set once (reference data, same for every user) -- Browse then filters this
 * in-memory list locally instead of a server round trip per keystroke. */
function useKanaList<T>(
  fetchAll: () => Promise<T[]>,
  cacheKey: string
): { data: T[] | null; status: AsyncStatus; error: string | null } {
  const [data, setData] = useState<T[] | null>(() => readCache<T[]>(cacheKey));
  const [status, setStatus] = useState<AsyncStatus>(data ? "loaded" : "loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((rows) => {
        if (cancelled) return;
        setData(rows);
        setStatus("loaded");
        writeCache(cacheKey, rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err, "Failed to load."));
        setStatus((prev) => (prev === "loaded" ? prev : "error"));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAll/cacheKey are stable per call site
  }, []);

  return { data, status, error };
}

export function useHiraganaList() {
  return useKanaList<BrowseKanaEntry>(() => fetchAllHiragana(createClient()), HIRAGANA_CACHE_KEY);
}

export function useKatakanaList() {
  return useKanaList<BrowseKanaEntry>(() => fetchAllKatakana(createClient()), KATAKANA_CACHE_KEY);
}

/** Fire-and-forget: called on hover/focus/touchstart of an Explore nav entry point, well before
 * the user actually navigates to the list page -- mirrors prefetchKanjiList/prefetchVocabularyList
 * so Hiragana/Katakana paint from a warm cache too instead of always starting cold on mount. */
export const prefetchHiraganaList = createPrefetcher(async () => {
  const rows = await fetchAllHiragana(createClient());
  writeCache(HIRAGANA_CACHE_KEY, rows);
});

export const prefetchKatakanaList = createPrefetcher(async () => {
  const rows = await fetchAllKatakana(createClient());
  writeCache(KATAKANA_CACHE_KEY, rows);
});
