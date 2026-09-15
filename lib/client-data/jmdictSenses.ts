"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchJmdictEntriesByIds, updateJmdictEntrySenses } from "@/lib/data/jmdictSenses";
import { ApiError, getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus, JmdictSense, JmdictSenseReviewRow } from "@/lib/types";

/** `useLayoutEffect` warns during SSR, so fall back to `useEffect` there -- see
 * useStudySettings's own copy of this same helper. */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Backs the sense-review page. `ids` is a small, fixed list (the entries flagged during the
 * primary/secondary sense review) so this skips the localStorage stale-while-revalidate layer
 * useVocabularyMatchReviewQueue uses -- that queue could be large/slow, this one never is. */
export function useJmdictSenseReviewRows(
  user: User | null,
  ids: number[]
): {
  data: JmdictSenseReviewRow[] | null;
  setData: Dispatch<SetStateAction<JmdictSenseReviewRow[] | null>>;
  status: AsyncStatus;
  error: string | null;
} {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<JmdictSenseReviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idsKey = ids.join(",");

  const refetch = useCallback(async () => {
    if (!user) return;
    setStatus("loading");
    try {
      const rows = await fetchJmdictEntriesByIds(createClient(), ids);
      setData(rows);
      setStatus("loaded");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load entries."));
      setStatus("error");
    }
    // idsKey is the stable identity for `ids` -- see below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, idsKey]);

  useIsomorphicLayoutEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, setData, status, error };
}

export async function saveJmdictEntrySenses(id: number, senses: JmdictSense[]): Promise<void> {
  try {
    await updateJmdictEntrySenses(createClient(), id, senses);
  } catch (err) {
    throw new ApiError(500, getErrorMessage(err, "Nu am putut salva alegerea."));
  }
}
