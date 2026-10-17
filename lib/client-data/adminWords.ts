"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { User } from "@supabase/auth-js";
import { getErrorMessage } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import { fetchAllWords } from "@/lib/data/adminWords";
import { fetchVocabularyReviews } from "@/lib/data/adminKanjiWords";
import type { AdminWordRow, AsyncStatus, VocabularyEditable, VocabularyReviewMark } from "@/lib/types";

/**
 * The /admin/words list (every word, ~7 MB), kept in memory for as long as the tab is open: back from a word's page,
 * or from anywhere else in the app, the list is on screen at once instead of downloading again. A list older than
 * STALE_MS is read again in the background when the list (or a word's page) asks for it, and stays on screen
 * meanwhile. A word saved on its page (from this list or from /admin/kanji-words) is patched in at once, and so is a
 * reviewed mark.
 */

const STALE_MS = 5 * 60 * 1000;

export interface AllWordsState {
  status: AsyncStatus;
  rows: AdminWordRow[] | null;
  /** vocabulary id -> its reviewed mark (a word with no mark isn't in it); null when the marks couldn't be read. */
  reviews: ReadonlyMap<number, VocabularyReviewMark> | null;
  error: string | null;
  /** A background reload is running, the list on screen is the older one. */
  refreshing: boolean;
}

type Data = Pick<AllWordsState, "rows" | "reviews">;

const INITIAL: AllWordsState = { status: "loading", rows: null, reviews: null, error: null, refreshing: false };

let state = INITIAL;
// Whose list it is: another user signing in on the tab starts over.
let owner: string | null = null;
let generation = 0;
let loadedAt = 0;
let inFlight: Promise<void> | null = null;
// Local changes, numbered: one made while a reload was running is applied again to what the reload brought (which
// may have been read before it was saved).
let seq = 0;
const changes: { seq: number; apply: (data: Data) => Data }[] = [];
const listeners = new Set<() => void>();

function emit(next: Partial<AllWordsState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function load(): Promise<void> {
  if (inFlight) return inFlight;
  const gen = generation;
  const fromSeq = seq;
  const background = state.rows !== null;
  emit(background ? { refreshing: true } : { status: "loading", error: null });
  inFlight = (async () => {
    const supabase = createClient();
    try {
      const [rows, reviews] = await Promise.all([
        fetchAllWords(supabase),
        // The marks are extra: without them (the RPC missing, say) the list is still the list.
        fetchVocabularyReviews(supabase, null).then(
          (list) => new Map(list.map((r) => [r.id, { at: r.at, by: r.by }])),
          () => null
        ),
      ]);
      if (gen !== generation) return;
      let data: Data = { rows, reviews };
      for (const change of changes) if (change.seq > fromSeq) data = change.apply(data);
      changes.length = 0;
      loadedAt = Date.now();
      emit({ status: "loaded", ...data, error: null, refreshing: false });
    } catch (err) {
      if (gen !== generation) return;
      // A failed background reload keeps the older list on screen.
      emit(background ? { refreshing: false } : { status: "error", error: getErrorMessage(err, "Failed to load words."), refreshing: false });
    } finally {
      if (gen === generation) inFlight = null;
    }
  })();
  return inFlight;
}

/** Loads the list for this user unless it's in memory and fresh; a stale one is read again in the background. */
export function ensureAllWords(userId: string) {
  if (owner !== userId) {
    owner = userId;
    generation += 1;
    inFlight = null;
    loadedAt = 0;
    changes.length = 0;
    state = INITIAL;
    listeners.forEach((listener) => listener());
  }
  if (state.status === "error" || state.rows === null || Date.now() - loadedAt > STALE_MS) void load();
}

export function useAllWords(user: User | null): AllWordsState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => INITIAL);
  const userId = user?.id ?? null;
  useEffect(() => {
    if (userId) ensureAllWords(userId);
  }, [userId]);
  return userId !== null && owner === userId ? snapshot : INITIAL;
}

function change(apply: (data: Data) => Data) {
  seq += 1;
  changes.push({ seq, apply });
  emit(apply({ rows: state.rows, reviews: state.reviews }));
}

/** A word saved on its page: the list shows the new values without a reload. */
export function patchCachedWord(id: number, v: VocabularyEditable) {
  const patch: Partial<AdminWordRow> = {
    kana_reading: v.kana_reading,
    romaji_reading: v.romaji_reading,
    furiganas: v.furiganas,
    short_meaning: v.short_meaning,
    primary_meanings: v.primary_meanings,
    other_meanings: v.other_meanings,
    jlpt_level: v.jlpt_level,
    is_common_jisho: v.is_common_jisho,
    usually_kana: v.usually_kana,
    study_enabled: v.study_enabled,
  };
  change((data) => (data.rows ? { ...data, rows: data.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)) } : data));
}

/** A word marked as reviewed (or no longer): the list's tag and filter follow at once. */
export function setCachedReview(id: number, mark: VocabularyReviewMark | null) {
  change((data) => {
    if (!data.reviews) return data;
    const reviews = new Map(data.reviews);
    if (mark) reviews.set(id, mark);
    else reviews.delete(id);
    return { ...data, reviews };
  });
}
