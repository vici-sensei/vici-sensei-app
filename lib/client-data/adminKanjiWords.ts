"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchKanjiWordsMeanings, fetchKanjiWordsOverview, fetchKanjiWordsTodoCount } from "@/lib/data/adminKanjiWords";
import { getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus, KanjiWordsMeaningsMap, KanjiWordsOverview, KanjiWordsTodoCount } from "@/lib/types";

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

/** The meanings of every word in the kanji list's chips, loaded in the background once the overview is on screen
 *  (~570 KB, too much to hold up the list for). A refetched overview -- after a save -- only asks for the words it
 *  hasn't got yet. `failed`: a load didn't work (e.g. the RPC isn't on this region yet), the chips say so. */
export function useKanjiWordsMeanings(overview: KanjiWordsOverview | null) {
  const [meanings, setMeanings] = useState<KanjiWordsMeaningsMap | null>(null);
  const [failed, setFailed] = useState(false);
  // Words already asked for, so one the server doesn't return isn't asked for again on every refetch; null
  // until the first, everything-at-once load has gone out.
  const requestedRef = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (!overview) return;
    const listed = new Set(overview.kanji.flatMap((row) => row.f.map((w) => w[0])));
    let ids: number[] | null = null;
    if (requestedRef.current === null) {
      requestedRef.current = listed;
    } else {
      const requested = requestedRef.current;
      ids = [...listed].filter((id) => !requested.has(id));
      if (ids.length === 0) return;
      for (const id of ids) requested.add(id);
    }
    // Not cancelled on a re-run: every answer only adds entries, so a late one is still right.
    fetchKanjiWordsMeanings(createClient(), ids)
      .then((loaded) => setMeanings((prev) => ({ ...(prev ?? {}), ...loaded })))
      .catch(() => setFailed(true));
  }, [overview]);

  return { meanings, failed };
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
