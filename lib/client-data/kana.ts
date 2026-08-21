"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllHiragana, fetchAllKatakana } from "@/lib/data/kana";
import { readCache, writeCache } from "@/lib/client-data/localCache";
import { getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus, NewHiraganaCandidate, NewKatakanaCandidate } from "@/lib/types";

const HIRAGANA_CACHE_KEY = "cache:hiragana-list";
const KATAKANA_CACHE_KEY = "cache:katakana-list";

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
  return useKanaList<NewHiraganaCandidate>(() => fetchAllHiragana(createClient()), HIRAGANA_CACHE_KEY);
}

export function useKatakanaList() {
  return useKanaList<NewKatakanaCandidate>(() => fetchAllKatakana(createClient()), KATAKANA_CACHE_KEY);
}
