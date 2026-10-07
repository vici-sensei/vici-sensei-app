"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchKanjiWordsOverview, fetchKanjiWordsTodoCount } from "@/lib/data/adminKanjiWords";
import { getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus, KanjiWordsOverview, KanjiWordsTodoCount } from "@/lib/types";

/** Every kanji with its final / algorithm lists (one ~600 KB document). `refetch` keeps the old data on
 *  screen while the new one loads, so a save doesn't blank the list. */
export function useKanjiWordsOverview(user: User | null) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<KanjiWordsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchKanjiWordsOverview(createClient())
      .then((overview) => {
        if (cancelled) return;
        setData(overview);
        setError(null);
        setStatus("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err, "Failed to load kanji words."));
        // A failed refresh keeps showing what was already loaded.
        setStatus((prev) => (prev === "loaded" ? prev : "error"));
      });
    return () => {
      cancelled = true;
    };
  }, [user, reloadTick]);

  const refetch = useCallback(() => setReloadTick((tick) => tick + 1), []);

  return { data, status, error, refetch };
}

/** The Overview tile: kanji still to review, and how many of them are flagged "algorithm changed". */
export function useKanjiWordsTodoCount(user: User | null) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<KanjiWordsTodoCount | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchKanjiWordsTodoCount(createClient())
      .then((counts) => {
        if (cancelled) return;
        setData(counts);
        setStatus("loaded");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { data, status };
}
