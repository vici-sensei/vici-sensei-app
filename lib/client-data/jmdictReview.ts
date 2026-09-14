"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchVocabularyMatchReviewQueue } from "@/lib/data/jmdictReview";
import { ApiError, getErrorMessage } from "@/lib/api/client";
import { readCache, writeCache } from "@/lib/client-data/localCache";
import type { AsyncStatus, VocabularyMatchReviewRow } from "@/lib/types";

function reviewQueueCacheKey(userId: string): string {
  return `cache:jmdict-review-queue:${userId}`;
}

/** `useLayoutEffect` warns during SSR, so fall back to `useEffect` there -- see
 * useStudySettings's own copy of this same helper. Using a layout effect (not a plain one) for
 * the cache-hydration read below just changes *when* it runs relative to paint, landing before
 * the browser ever shows the pre-hydration blank state. */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Backs the jmdict review page. The RPC itself now returns resolved rows too (within a rolling
 * window -- see get_vocabulary_match_review_queue), so "resolved, with an Undo button" is
 * authoritative from the database rather than only client-side state; this hook additionally
 * mirrors `data` to localStorage (same stale-while-revalidate shape as useStudySettings) purely
 * so a refresh or reopened tab repaints the last-known state -- resolved cards, Undo buttons and
 * all -- instantly instead of a blank skeleton while the network round-trip is in flight. */
export function useVocabularyMatchReviewQueue(user: User | null): {
  data: VocabularyMatchReviewRow[] | null;
  setData: Dispatch<SetStateAction<VocabularyMatchReviewRow[] | null>>;
  status: AsyncStatus;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<VocabularyMatchReviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) return;
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const rows = await fetchVocabularyMatchReviewQueue(createClient());
      setData(rows);
      setStatus("loaded");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load the review queue."));
      setStatus("error");
    }
  }, [user]);

  useIsomorphicLayoutEffect(() => {
    if (!user) return;
    const cached = readCache<VocabularyMatchReviewRow[]>(reviewQueueCacheKey(user.id));
    if (cached) {
      setData(cached);
      setStatus("loaded");
    }
    void refetch();
  }, [user, refetch]);

  // Mirrors every change to `data` -- both this hook's own refetch and the page's optimistic
  // setData calls after a pick/undo -- so the cache never lags behind what's actually on screen.
  useEffect(() => {
    if (!user || data === null) return;
    writeCache(reviewQueueCacheKey(user.id), data);
  }, [user, data]);

  return { data, setData, status, error, refetch };
}

export async function resolveJmdictMatch(jrowId: number, vocabId: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("jmdict_entries")
    .update({ vocabulary_id: vocabId, match_method: "manual", matched_at: new Date().toISOString() })
    .eq("id", jrowId);
  if (error) throw new ApiError(500, error.message);
}

export async function confirmNoMatch(vocabId: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("vocabulary")
    .update({ jmdict_match_reviewed: true, jmdict_match_reviewed_at: new Date().toISOString() })
    .eq("id", vocabId);
  if (error) throw new ApiError(500, error.message);
}

/** Reverses resolveJmdictMatch -- lets the admin review page offer an "Undo" on an already-picked
 * match instead of that being a DB-only fix. */
export async function unlinkJmdictMatch(jrowId: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("jmdict_entries")
    .update({ vocabulary_id: null, match_method: null, matched_at: null })
    .eq("id", jrowId);
  if (error) throw new ApiError(500, error.message);
}

/** Reverses confirmNoMatch. */
export async function unconfirmNoMatch(vocabId: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("vocabulary")
    .update({ jmdict_match_reviewed: false, jmdict_match_reviewed_at: null })
    .eq("id", vocabId);
  if (error) throw new ApiError(500, error.message);
}
