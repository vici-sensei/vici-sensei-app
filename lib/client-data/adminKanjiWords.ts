"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import {
  fetchKanjiWordsMeanings,
  fetchKanjiWordsOverview,
  fetchKanjiWordsTodoCount,
  fetchKanjiWordVocabulary,
} from "@/lib/data/adminKanjiWords";
import { getErrorMessage } from "@/lib/api/client";
import type {
  AsyncStatus,
  KanjiWordCandidate,
  KanjiWordCandidates,
  KanjiWordMeaningsTuple,
  KanjiWordsMeaningsMap,
  KanjiWordsOverview,
  KanjiWordsRow,
  KanjiWordsTodoCount,
  KanjiWordTuple,
  KanjiWordVocabulary,
} from "@/lib/types";

/*
 * The /admin/kanji-words data, kept in memory for as long as the tab is open: back from a word's page (the pencil on
 * a word card), or from anywhere else in the app, the kanji list, the chips' meanings and the kanji opened lately are
 * on screen at once instead of downloading again. Older than STALE_MS, they are read again in the background when
 * the page asks for them, and stay on screen meanwhile. A word saved on its page is patched in at once (see
 * app/(shell)/admin/kanji-words/kanjiWordsMemory.ts).
 */

const STALE_MS = 5 * 60 * 1000;
/** Kanji whose candidates are kept; beyond that, the one opened longest ago is dropped. */
const CANDIDATES_KEPT = 30;
/** A word read ahead (the pointer on its pencil) is used if its page opens within this long. */
const PREFETCH_MS = 30 * 1000;

export interface KanjiWordsState {
  status: AsyncStatus;
  /** Every kanji with its final / algorithm lists (one ~600 KB document). */
  data: KanjiWordsOverview | null;
  error: string | null;
  /** The meanings of every word in the list's chips (~570 KB), read after the list; null = not yet. */
  meanings: KanjiWordsMeaningsMap | null;
  /** A meanings read didn't work (e.g. the RPC isn't on this region yet): the chips say so. */
  meaningsFailed: boolean;
}

const INITIAL: KanjiWordsState = { status: "loading", data: null, error: null, meanings: null, meaningsFailed: false };

let state = INITIAL;
// Whose data it is: another user signing in on the tab starts over.
let owner: string | null = null;
let generation = 0;
let loadedAt = 0;
let inFlight = false;
// A reload asked for while one was running (a save just landed, which that read may predate): it runs right after.
let again = false;
// Words whose meanings were asked for, so one the server doesn't return isn't asked for again on every reload; null
// until the first, everything-at-once read has gone out.
let requested: Set<number> | null = null;
// kanji id -> its candidates as last read (`at`, 0 = never read here) or as patched since; the newest last.
const candidates = new Map<number, { data: KanjiWordCandidates; at: number }>();
// kanji_word id -> its word, read ahead.
const prefetched = new Map<number, { promise: Promise<KanjiWordVocabulary>; at: number }>();
const listeners = new Set<() => void>();
// Reviewed marks set from the list, numbered: one set while a reload was running is applied again to what the reload
// brings (which may have been read before it was written).
let seq = 0;
const reviewMarks: (KanjiReviewedChange & { seq: number })[] = [];
const reviewListeners = new Set<(change: KanjiReviewedChange) => void>();

function emit(next: Partial<KanjiWordsState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The meanings of the words the list shows that haven't been asked for yet (all of them, the first time). */
function loadMeanings(overview: KanjiWordsOverview, gen: number) {
  const listed = new Set(overview.kanji.flatMap((row) => row.f.map((w) => w[0])));
  let ids: number[] | null = null;
  if (requested === null) {
    requested = listed;
  } else {
    const known = requested;
    ids = [...listed].filter((id) => !known.has(id));
    if (ids.length === 0) return;
    for (const id of ids) known.add(id);
  }
  // Every answer only adds entries, so a late one is still right.
  fetchKanjiWordsMeanings(createClient(), ids)
    .then((loaded) => {
      if (gen === generation) emit({ meanings: { ...(state.meanings ?? {}), ...loaded } });
    })
    .catch(() => {
      if (gen === generation) emit({ meaningsFailed: true });
    });
}

function load() {
  if (inFlight) {
    again = true;
    return;
  }
  inFlight = true;
  const gen = generation;
  const fromSeq = seq;
  if (state.data === null) emit({ status: "loading", error: null });
  fetchKanjiWordsOverview(createClient())
    .then((read) => {
      if (gen !== generation) return;
      const data = reviewMarks.filter((mark) => mark.seq > fromSeq).reduce(withReviewed, read);
      reviewMarks.length = 0;
      loadedAt = Date.now();
      emit({ status: "loaded", data, error: null });
      loadMeanings(data, gen);
    })
    .catch((err) => {
      if (gen !== generation) return;
      // A failed reload keeps showing what was already loaded.
      emit({ status: state.data ? "loaded" : "error", error: getErrorMessage(err, "Failed to load kanji words.") });
    })
    .finally(() => {
      if (gen !== generation) return;
      inFlight = false;
      if (again) {
        again = false;
        load();
      }
    });
}

/** Loads the list for this user unless it's in memory and fresh; a stale one is read again in the background. */
function ensure(userId: string) {
  if (owner !== userId) {
    owner = userId;
    generation += 1;
    inFlight = false;
    again = false;
    loadedAt = 0;
    requested = null;
    candidates.clear();
    prefetched.clear();
    reviewMarks.length = 0;
    state = INITIAL;
    listeners.forEach((listener) => listener());
  }
  if (state.data === null || Date.now() - loadedAt > STALE_MS) load();
}

/** The kanji list and the chips' meanings for this user (null: none yet, e.g. no multi-region). */
export function useKanjiWords(user: User | null): KanjiWordsState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => INITIAL);
  const userId = user?.id ?? null;
  useEffect(() => {
    if (userId) ensure(userId);
  }, [userId]);
  return userId !== null && owner === userId ? snapshot : INITIAL;
}

/** Something was written (a save, a bulk change): the list is read again, staying on screen meanwhile. */
export function reloadKanjiWords() {
  if (owner !== null) load();
}

/** A word was saved: the list is read again (in the background) the next time the page asks for it. */
export function markKanjiWordsStale() {
  loadedAt = 0;
}

/** One kanji's row of the list in memory, if any. */
export function cachedKanjiRow(kanjiId: number): KanjiWordsRow | null {
  return state.data?.kanji.find((row) => row.id === kanjiId) ?? null;
}

/** Patch the list's word chips (a word's level or "common" changed). */
export function patchKanjiWordTuples(ids: Set<number>, patch: (tuple: KanjiWordTuple, row: KanjiWordsRow) => KanjiWordTuple) {
  const data = state.data;
  if (!data) return;
  const fix = (list: KanjiWordTuple[], row: KanjiWordsRow) =>
    list.some((w) => ids.has(w[0])) ? list.map((w) => (ids.has(w[0]) ? patch(w, row) : w)) : list;
  const kanji = data.kanji.map((row) => {
    const f = fix(row.f, row);
    const a = row.a && fix(row.a, row);
    return f === row.f && a === row.a ? row : { ...row, f, a };
  });
  emit({ data: { ...data, kanji } });
}

/** A kanji's reviewed mark, changed from the list: version `from` (the one quoted) became `version`. */
export interface KanjiReviewedChange {
  kanjiId: number;
  from: number;
  version: number;
  reviewed: boolean;
}

// Only onto a row older than the change: a reload that already has it (or something newer) is left alone. Marking
// stamps the algorithm's list the review saw, so "Re-check" goes; taking the mark away leaves it as it was.
function withReviewed(data: KanjiWordsOverview, change: KanjiReviewedChange): KanjiWordsOverview {
  const kanji = data.kanji.map((row) =>
    row.id === change.kanjiId && row.v < change.version
      ? { ...row, r: change.reviewed, v: change.version, ac: change.reviewed ? false : row.ac }
      : row
  );
  return { ...data, kanji };
}

/**
 * A kanji was marked as reviewed (or no longer) from the list: its row, its kept candidates and a panel open on it
 * (see onKanjiReviewed) show it at once and quote the new version. The rest of the row (the last change) comes with
 * the reload this starts.
 */
export function applyKanjiReviewed(change: KanjiReviewedChange) {
  seq += 1;
  reviewMarks.push({ ...change, seq });
  if (state.data) emit({ data: withReviewed(state.data, change) });
  const entry = candidates.get(change.kanjiId);
  if (entry && entry.data.version === change.from) {
    candidates.set(change.kanjiId, { ...entry, data: { ...entry.data, version: change.version, reviewed: change.reviewed } });
  }
  reviewListeners.forEach((listener) => listener(change));
  reloadKanjiWords();
}

/** Called with every reviewed mark the list changes; returns the unsubscribe. */
export function onKanjiReviewed(listener: (change: KanjiReviewedChange) => void) {
  reviewListeners.add(listener);
  return () => {
    reviewListeners.delete(listener);
  };
}

/** Patch the chips' meanings (kanji_word id -> the word's meanings now). */
export function patchKanjiWordMeanings(entries: Record<string, KanjiWordMeaningsTuple>) {
  if (state.meanings) emit({ meanings: { ...state.meanings, ...entries } });
}

// ---------------------------------------------------------------------------
// One kanji's candidates (the panel)
// ---------------------------------------------------------------------------

/** The kanji's candidates in memory; `fresh` = read less than STALE_MS ago. */
export function cachedCandidates(kanjiId: number): { data: KanjiWordCandidates; fresh: boolean } | null {
  const entry = candidates.get(kanjiId);
  return entry ? { data: entry.data, fresh: Date.now() - entry.at < STALE_MS } : null;
}

/** Keep the kanji's candidates (`readNow`: just read from the server, else a local change to what was read). */
export function storeCandidates(kanjiId: number, data: KanjiWordCandidates, readNow: boolean) {
  const at = readNow ? Date.now() : (candidates.get(kanjiId)?.at ?? 0);
  candidates.delete(kanjiId);
  candidates.set(kanjiId, { data, at });
  while (candidates.size > CANDIDATES_KEPT) candidates.delete(candidates.keys().next().value as number);
}

/** Patch these candidates (kanji_word ids) under every kanji kept. */
export function patchCandidates(
  ids: Set<number>,
  patch: (c: KanjiWordCandidate, kanji: KanjiWordCandidates["kanji"]) => KanjiWordCandidate
) {
  for (const [kanjiId, entry] of candidates) {
    if (!entry.data.candidates.some((c) => ids.has(c.id))) continue;
    const list = entry.data.candidates.map((c) => (ids.has(c.id) ? patch(c, entry.data.kanji) : c));
    candidates.set(kanjiId, { ...entry, data: { ...entry.data, candidates: list } });
  }
}

/** A candidate (kanji_word id) as some kept kanji has it: a word page's heading before the word loads. */
export function cachedCandidate(kanjiWordId: number): KanjiWordCandidate | null {
  for (const entry of candidates.values()) {
    const found = entry.data.candidates.find((c) => c.id === kanjiWordId);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// A word read ahead, for its page
// ---------------------------------------------------------------------------

/** Start reading a word (a kanji_word id) its page is likely to need: the pointer is on its pencil. */
export function prefetchKanjiWordVocabulary(kanjiWordId: number) {
  const hit = prefetched.get(kanjiWordId);
  if (hit && Date.now() - hit.at < PREFETCH_MS) return;
  const promise = fetchKanjiWordVocabulary(createClient(), kanjiWordId);
  prefetched.set(kanjiWordId, { promise, at: Date.now() });
  // A failed read ahead is just forgotten: the page reads the word itself.
  promise.catch(() => {
    if (prefetched.get(kanjiWordId)?.promise === promise) prefetched.delete(kanjiWordId);
  });
}

/** The word, from the read ahead if there is a recent one (used once), else read now. */
export function takeKanjiWordVocabulary(kanjiWordId: number): Promise<KanjiWordVocabulary> {
  const hit = prefetched.get(kanjiWordId);
  prefetched.delete(kanjiWordId);
  if (hit && Date.now() - hit.at < PREFETCH_MS) return hit.promise;
  return fetchKanjiWordVocabulary(createClient(), kanjiWordId);
}

/** These words were saved: what was read ahead of them is out of date. */
export function dropKanjiWordVocabulary(ids: Iterable<number>) {
  for (const id of ids) prefetched.delete(id);
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
