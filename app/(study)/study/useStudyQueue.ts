"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import {
  completeVocabBatch,
  endSession as endStudySessionApi,
  getFirstDueCard,
  getHiraganaReadingCards,
  getKanjiIntroCards,
  getKatakanaReadingCards,
  getSessionProgress as getSessionProgressApi,
  getStudyQueue,
  introduceKanji as introduceKanjiApi,
  introduceVocabulary as introduceVocabularyApi,
  introduceHiragana as introduceHiraganaApi,
  introduceKatakana as introduceKatakanaApi,
  startSession as startStudySessionApi,
  submitHiraganaDrillResult as submitHiraganaDrillResultApi,
  submitKatakanaDrillResult as submitKatakanaDrillResultApi,
  submitReview as submitReviewApi,
  undoReview as undoReviewApi,
} from "@/lib/client-data/study";
import { useStudyOnboarding } from "@/lib/study/StudyOnboardingContext";
import { useServerClockOffset } from "@/lib/client-data/serverClockOffset";
import { clearFirstCardCache, readFirstCardCache, writeFirstCardCache } from "@/lib/study/firstCardCache";
import { useToast } from "@/app/components/ui/Toast";
import { clearStoredSessionId, getStoredSessionId, setStoredSessionId } from "@/lib/study/session";
import type { DueCard, NewKanjiIntroWord, Rating, ReviewRequestBody, StudyQueueResponse } from "@/lib/types";
import { newKanjiKey, newVocabKey, newHiraganaKey, newKatakanaKey, reviewKey, type QueueItem } from "./types";

const REFRESH_INTERVAL_MS = 45_000;

type Status = "loading" | "ready" | "ending" | "error";

interface LastReview {
  card: DueCard;
}

function buildQueue(data: StudyQueueResponse): QueueItem[] {
  const items: QueueItem[] = [];
  for (const card of data.due_cards) items.push({ key: reviewKey(card), kind: "review", card });
  for (const candidate of data.new_kanji_to_introduce) {
    items.push({ key: newKanjiKey(candidate.id), kind: "new_kanji", candidate });
  }
  for (const candidate of data.new_vocab_to_introduce) {
    items.push({ key: newVocabKey(candidate.id), kind: "new_vocab", candidate });
  }
  for (const candidate of data.new_hiragana_to_introduce) {
    items.push({ key: newHiraganaKey(candidate.id), kind: "new_hiragana", candidate });
  }
  for (const candidate of data.new_katakana_to_introduce) {
    items.push({ key: newKatakanaKey(candidate.id), kind: "new_katakana", candidate });
  }
  return items;
}

function patchKanjiWords(items: QueueItem[], wordsByKanjiId: Map<number, NewKanjiIntroWord[]>): QueueItem[] {
  let changed = false;
  const patched = items.map((item) => {
    if (item.kind !== "new_kanji") return item;
    const words = wordsByKanjiId.get(item.candidate.id);
    if (!words) return item;
    changed = true;
    return { ...item, candidate: { ...item.candidate, words } };
  });
  return changed ? patched : items;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Reviews always come before new material, so a review that becomes due mid-session
// (e.g. a learning-step retest) never gets stuck behind new cards that were already queued.
// Reviews are shuffled together -- so hiragana_reading and katakana_reading (and, on the
// standard track, kanji/vocab reviews) interleave instead of clumping by category. New
// material keeps the order the DB already returns it in (sort_order/id) instead of being
// shuffled, and stays grouped one category block at a time in the order buildQueue appended
// them (new_kanji, new_vocab, new_hiragana, new_katakana) -- e.g. all New hiragana before any
// New katakana, each internally in gojuon order.
function reviewsFirst(items: QueueItem[]): QueueItem[] {
  const reviews = shuffle(items.filter((i) => i.kind === "review"));
  const newCards = items.filter((i) => i.kind !== "review");
  return [...reviews, ...newCards];
}

// Same priority, but leaves the card currently on screen in place so a merge never
// yanks it out from under the user mid-answer, and leaves already-queued cards in place too --
// only newly-fetched review additions get shuffled in (new-material additions keep DB order,
// same reasoning as reviewsFirst), so the rest of the queue doesn't visibly reorder itself out
// from under the user on every poll.
//
// One exception: the remaining, not-yet-shown members of a gojuon pack the user has already
// started (isInProgressPackItem -- see introduceKanaCard) are kept ahead of anything newly
// discovered by this merge. Without this, a review that becomes due mid-pack (e.g. yesterday's
// hiragana coming due while today's "New Hiragana" pack is only half introduced) would splice
// in front of the pack's remaining cards, breaking the "New Hiragana pack, then its Hiragana
// reading pack, with nothing else in between" guarantee.
function mergeKeepingCurrent(
  prev: QueueItem[],
  additions: QueueItem[],
  isInProgressPackItem: (item: QueueItem) => boolean
): QueueItem[] {
  if (prev.length === 0) return reviewsFirst(additions);
  const [current, ...rest] = prev;
  const restReviews = rest.filter((i) => i.kind === "review");
  const restNew = rest.filter((i) => i.kind !== "review");
  const restInProgressPack = restNew.filter(isInProgressPackItem);
  const restOtherNew = restNew.filter((i) => !isInProgressPackItem(i));
  const addReviews = shuffle(additions.filter((i) => i.kind === "review"));
  const addNew = additions.filter((i) => i.kind !== "review");
  return [current, ...restReviews, ...restInProgressPack, ...addReviews, ...restOtherNew, ...addNew];
}

// A hiragana_reading/katakana_reading card whose progress is still status='learning' is mid
// post-introduction drill (see submitDrillAnswer) -- answered right or wrong, it keeps coming
// back until it's graduated. At most one such card is ever shown at a time; the rest sit in
// hiragana/katakanaDrillPoolRef and get drawn at random as the visible one is answered.
function isDrillCard(item: QueueItem): item is QueueItem & { kind: "review" } {
  return (
    item.kind === "review" &&
    item.card.status === "learning" &&
    (item.card.exercise_type === "hiragana_reading" || item.card.exercise_type === "katakana_reading")
  );
}

function hasVisibleDrillCard(items: QueueItem[], exerciseType: "hiragana_reading" | "katakana_reading"): boolean {
  return items.some((i) => isDrillCard(i) && i.card.exercise_type === exerciseType);
}

// Applied to any freshly-fetched batch of due_cards (not just the first hand-off from
// introduceKanaCard's finishPack) so that resuming a drill after a page refresh -- where
// get_due_cards can return several still-learning hiragana_reading/katakana_reading rows at
// once -- still only ever surfaces one at a time, with the rest pooled, instead of scattering
// them back across the normal review shuffle.
//
// hiragana/katakanaInFlight guard a real race: a drill card that's just been answered (or a
// pack that's just finished introducing) briefly sits in NEITHER `queue` NOR the pool while its
// own async resolution (submitDrillAnswer/finishPack) is still in flight -- fetchStudyQueue's
// due_cards still includes it (its due_at never advances until it graduates), so a poll that
// lands in exactly that window would otherwise see zero visible drill cards, wrongly decide
// this row is a fresh discovery, and add a SECOND copy to the queue instead of pooling it --
// two hiragana_reading cards visible at once, one of them never reachable again. Any id in
// these sets is temporarily "owned" by that in-flight resolution, so it's dropped here entirely
// instead of pooled or kept -- the owner will place it correctly once it resolves.
function poolExtraDrillCards(
  additions: QueueItem[],
  prev: QueueItem[],
  hiraganaPool: DueCard[],
  katakanaPool: DueCard[],
  hiraganaInFlight: Set<number>,
  katakanaInFlight: Set<number>
): QueueItem[] {
  let hiraganaTaken = hasVisibleDrillCard(prev, "hiragana_reading");
  let katakanaTaken = hasVisibleDrillCard(prev, "katakana_reading");
  const kept: QueueItem[] = [];
  for (const item of additions) {
    if (!isDrillCard(item)) {
      kept.push(item);
      continue;
    }
    const isHiragana = item.card.exercise_type === "hiragana_reading";
    const id = isHiragana ? item.card.hiragana_id : item.card.katakana_id;
    if (id != null && (isHiragana ? hiraganaInFlight : katakanaInFlight).has(id)) continue;
    if (isHiragana ? hiraganaTaken : katakanaTaken) {
      (isHiragana ? hiraganaPool : katakanaPool).push(item.card);
    } else {
      kept.push(item);
      if (isHiragana) hiraganaTaken = true;
      else katakanaTaken = true;
    }
  }
  return kept;
}

// A group key for the one shared "vocab batch" (see introduceVocab below and
// 20260829_pair_new_vocab_with_vocab_batch.sql) -- unlike kanji, which has one bundle per
// kanji_id, there's only ever one vocab batch per user at a time (today's), so every
// still-'learning' vocab_meaning card shares this single constant key.
const VOCAB_BATCH_KEY = "vocab-batch";

// A still-learning kanji_meaning/kanji_reading card is part of a kanji's not-yet-completed
// intro bundle (see introduceKanji below and 20260828_pair_new_kanji_with_intro_bundle.sql), and
// a still-learning vocab_meaning card is part of today's not-yet-completed vocab batch -- once
// either graduates to status='review' it's just a normal independent review again, and drops out
// of its group. Unlike hiragana/katakana's drill, there's no separate "still drilling" flag
// needed for either: a row simply never leaves 'learning' until it actually graduates through
// the normal rating flow.
function introBundleKey(item: QueueItem): string | null {
  if (item.kind !== "review") return null;
  const { card } = item;
  if (card.status !== "learning") return null;
  if (card.exercise_type === "kanji_meaning" || card.exercise_type === "kanji_reading") {
    return `kanji-${card.kanji_id}`;
  }
  if (card.exercise_type === "vocab_meaning") return VOCAB_BATCH_KEY;
  return null;
}

// Drops any freshly-fetched kanji_meaning/kanji_reading card whose kanji_id is currently owned
// by an in-flight introduceKanji call (kanjiInFlight), and any vocab_meaning card while a
// vocab-batch hand-off is in flight (vocabBatchInFlight) -- same reasoning as
// poolExtraDrillCards' hiragana/katakanaInFlight sets: introduce_kanji sets due_at = now() on
// insert, and complete_vocab_batch flips pending_batch/due_at for a whole batch at once, so a
// refreshQueue poll landing between that resolving and the follow-up getKanjiIntroCards/
// completeVocabBatch fetch resolving would otherwise "discover" these rows as a fresh addition
// and duplicate them once the owning call's own block insert lands right after. (Not strictly
// required for correctness any more -- complete_vocab_batch's UPDATE...RETURNING means a
// concurrent caller can never receive the same row twice at the DB level -- but keeping it
// symmetric with kanjiInFlight avoids a visible flash where a poll's generic merge briefly
// shows the batch before this call's own atomic block insert does.)
function dropInFlightIntroCards(
  additions: QueueItem[],
  kanjiInFlight: Set<number>,
  vocabBatchInFlight: boolean
): QueueItem[] {
  return additions.filter((item) => {
    if (item.kind !== "review") return true;
    const { card } = item;
    // kanji_id is only ever set on kanji_meaning/kanji_reading rows (see get_due_cards) --
    // every other exercise_type carries it as null, so this alone disambiguates them.
    if (card.kanji_id != null) return !kanjiInFlight.has(card.kanji_id);
    if (card.exercise_type === "vocab_meaning") return !vocabBatchInFlight;
    return true;
  });
}

// Keeps a still-learning kanji bundle or the vocab batch contiguous, AND pulls it ahead of
// unrelated reviews -- so a page refresh, which has no memory of introduceKanji's/
// introduceVocab's own atomic block insert below, still lands the user right back where they
// were: finishing the in-progress group before anything else, exactly like the live
// (no-refresh) session already guarantees via mergeKeepingCurrent's "already-queued beats
// newly-discovered" rule. The relative order of every non-grouped item is preserved exactly
// (only grouped members get pulled forward, everything else just closes the gaps they leave) --
// so this has zero effect on hiragana/katakana ordering, or on plain review-vs-review order,
// whenever no kanji bundle or vocab batch is present.
//
// `hasFixedCurrent` (default true, matching every existing call site) says whether items[0] is
// already on screen and therefore immovable -- mergeKeepingCurrent's own contract, for the
// refreshQueue/settled-merge callers. Pass false only for a brand-new queue nothing has been
// painted from yet (the cold-load branch in init()): there items[0] is just wherever
// reviewsFirst's shuffle happened to land, not a real "current" -- without this, an unrelated
// review that the shuffle placed first would keep winning by luck instead of the group always
// taking priority.
function groupIntroBundles(items: QueueItem[], hasFixedCurrent = true): QueueItem[] {
  if (items.length <= 1) return items;

  const groups = new Map<string, QueueItem[]>();
  for (const item of items) {
    const key = introBundleKey(item);
    if (key == null) continue;
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(item);
  }
  if (groups.size === 0) return items;

  // The vocab batch is one flat shuffled list; a kanji bundle keeps its meaning card first,
  // then shuffles only its reading cards.
  const orderBundle = (key: string): QueueItem[] => {
    const group = groups.get(key) ?? [];
    if (key === VOCAB_BATCH_KEY) return shuffle(group);
    const meaning = group.filter((i) => i.kind === "review" && i.card.exercise_type === "kanji_meaning");
    const readings = shuffle(group.filter((i) => i.kind === "review" && i.card.exercise_type === "kanji_reading"));
    return [...meaning, ...readings];
  };

  const placed = new Set<QueueItem>();
  const head: QueueItem[] = []; // items[0]'s own group, only when it's pinned in place
  const bundles: QueueItem[] = []; // every other incomplete group, pulled ahead of everything else
  const others: QueueItem[] = []; // everything else, in its original relative order

  let rest = items;
  if (hasFixedCurrent) {
    const headKey = introBundleKey(items[0]);
    if (headKey != null) {
      for (const item of orderBundle(headKey)) {
        head.push(item);
        placed.add(item);
      }
    } else {
      head.push(items[0]);
      placed.add(items[0]);
    }
    rest = items.slice(1);
  }

  const seenBundles = new Set<string>();
  for (const item of rest) {
    if (placed.has(item)) continue;
    const key = introBundleKey(item);
    if (key == null) {
      others.push(item);
      placed.add(item);
      continue;
    }
    if (seenBundles.has(key)) continue; // already placed via an earlier member of the same group
    seenBundles.add(key);
    for (const sibling of orderBundle(key)) {
      if (placed.has(sibling)) continue;
      bundles.push(sibling);
      placed.add(sibling);
    }
  }

  return [...head, ...bundles, ...others];
}

function reviewBody(card: DueCard, rating: Rating, sessionId: number | undefined): ReviewRequestBody {
  const body: ReviewRequestBody = { exercise_type: card.exercise_type, rating, session_id: sessionId };
  if (card.exercise_type === "kanji_meaning") body.kanji_id = card.kanji_id ?? undefined;
  else if (card.exercise_type === "kanji_reading") body.kanji_word_id = card.kanji_word_id ?? undefined;
  else if (card.exercise_type === "vocab_meaning") body.word_id = card.word_id ?? undefined;
  else if (card.exercise_type === "hiragana_reading") body.hiragana_id = card.hiragana_id ?? undefined;
  else body.katakana_id = card.katakana_id ?? undefined;
  return body;
}

export function useStudyQueue() {
  const router = useRouter();
  const { user, settings } = useStudyOnboarding();
  const { showToast } = useToast();
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  // The whole day's card count, including not-yet-created future cards (see
  // computePredictedTotal in lib/data/studyQueue.ts) -- (re)computed from every full queue
  // fetch (init and refreshQueue), independent of `queue`'s own length. This is what drives the
  // progress bar's denominator: unlike the old completedCount + queue.length scheme, it's
  // already as large as the whole day will ever need from the very first fetch, so answering a
  // "New kanji"/"New vocabulary" card and getting its whole bundle/batch back doesn't grow the
  // denominator at all -- it was already counted.
  //
  // Only ever RAISED (via setPredictedTotal's own Math.max, never assigned the fresh value
  // outright) -- a fresh recompute is a snapshot of "what's due or predictable right now", and
  // it legitimately DIPS below the running total whenever something just answered leaves the
  // due-now set (e.g. an Easy rating graduating a card days into the future takes it out of
  // get_due_cards immediately, even though it was already counted once in the original
  // prediction and just got its one and only answer). Never letting the total drop keeps that
  // dip from ever being visible; a genuinely new discovery (e.g. a learning-step retry becoming
  // due later this session) still raises it, with the usual "+N" badge in QueueProgressBar.
  const [predictedTotal, setPredictedTotal] = useState(0);
  const [nextDueAt, setNextDueAt] = useState<string | null>(null);
  const [lastReview, setLastReview] = useState<LastReview | null>(null);
  const [undoPending, setUndoPending] = useState(false);
  const [undoDisabled, setUndoDisabled] = useState(false);
  // Key of the one card currently held on screen instead of being optimistically removed --
  // either a pack-completing new_hiragana/new_katakana card awaiting its reading pack, or a
  // drill card (see submitDrillAnswer) answered when no other pool card was left to swap in.
  // Held so the page can disable its button and avoid a double-submit while the result is
  // still in flight. Only one of these can ever be true at once (there's only one `current`).
  const [pendingCardKey, setPendingCardKey] = useState<string | null>(null);
  // Only this route group lacks a StudyStatsProvider ((shell) is the only layout with one) --
  // fetched directly here, same as the leaderboard page and /study/summary.
  const clockOffsetMs = useServerClockOffset();

  const sessionIdRef = useRef<number | null>(null);
  const endingRef = useRef(false);
  const hasProcessedAnyRef = useRef(false);
  // The review_logs id of the most recently *confirmed-submitted* review from this tab, or
  // null while a submit is in flight/failed. Undo reads this (after the mutation chain has
  // caught it up) instead of asking the server to guess "the latest review" -- that guess can
  // pick the wrong row under multi-tab use or a submit/undo race, duplicating cards in the queue.
  const lastReviewLogIdRef = useRef<number | null>(null);
  // Background mutations (review/introduce/undo) are chained through this instead of
  // awaited by the UI, so the next card can show immediately while still guaranteeing
  // the server sees them in the order the user actually answered — important for undo,
  // which needs the review it's undoing to have landed first.
  const mutationChainRef = useRef<Promise<void>>(Promise.resolve());
  // Pack tracking for introduceKanaCard (below): activeRef marks a gojuon_row as "being
  // introduced" from the moment its first card is tapped (synchronous, so mergeKeepingCurrent
  // can protect its remaining cards from the very first tap, not just once the server confirms
  // it) until the pack completes. doneRef accumulates the ids actually confirmed introduced, in
  // resolution order, so the reading-pack fetch asks for exactly the right characters.
  const hiraganaActivePackRef = useRef<Set<string>>(new Set());
  const hiraganaPackDoneRef = useRef<Map<string, number[]>>(new Map());
  const katakanaActivePackRef = useRef<Set<string>>(new Set());
  const katakanaPackDoneRef = useRef<Map<string, number[]>>(new Map());
  // Post-introduction drill pools (see submitDrillAnswer): not-yet-graduated hiragana_reading/
  // katakana_reading cards waiting for their turn. Only one card of each kind is ever visible
  // in `queue` at a time -- the next one is drawn at random from here whenever the visible one
  // is answered, and pushed back in (unless it just graduated) once its result comes back.
  const hiraganaDrillPoolRef = useRef<DueCard[]>([]);
  const katakanaDrillPoolRef = useRef<DueCard[]>([]);
  // Ids currently "owned" by an in-flight finishPack/submitDrillAnswer resolution -- see
  // poolExtraDrillCards for why this is needed (closes a real race between a concurrent
  // refreshQueue poll and a drill card's own async resolution).
  const hiraganaInFlightRef = useRef<Set<number>>(new Set());
  const katakanaInFlightRef = useRef<Set<number>>(new Set());
  // kanji_ids currently owned by an in-flight introduceKanji call (RPC + getKanjiIntroCards
  // fetch) -- see dropInFlightIntroCards for why this is needed (same race as
  // hiragana/katakanaInFlightRef above, one kanji at a time instead of pooled).
  const kanjiInFlightRef = useRef<Set<number>>(new Set());
  // Whether a vocab-batch hand-off (RPC + completeVocabBatch fetch, triggered by the last
  // "New vocabulary" card in the queue) is currently in flight -- there's only ever one vocab
  // batch at a time, so a boolean is enough (unlike kanjiInFlightRef's per-kanji Set).
  const vocabBatchInFlightRef = useRef(false);
  // See QueueItem.renderKey -- incremented each time submitDrillAnswer reshows a held card
  // after a not-yet-graduated result, so its React key differs from the previous attempt.
  const drillRetryCounterRef = useRef(0);

  // Whether `item` is a not-yet-shown member of a gojuon pack the user has already started --
  // see mergeKeepingCurrent's isInProgressPackItem parameter.
  const isInProgressPackItem = useCallback((item: QueueItem): boolean => {
    if (item.kind === "new_hiragana") return hiraganaActivePackRef.current.has(item.candidate.gojuon_row);
    if (item.kind === "new_katakana") return katakanaActivePackRef.current.has(item.candidate.gojuon_row);
    return false;
  }, []);

  const endSession = useCallback(
    async (hasProgress: boolean) => {
      if (endingRef.current) return;
      endingRef.current = true;
      setStatus("ending");

      // Wait for every queued review/introduce mutation to actually land before either
      // branch below reads or ends the session server-side — otherwise end_study_session's
      // cards_reviewed count (or the /study/summary page's own call to it) can run against
      // a session that still has an in-flight submit_review, undercounting it.
      await mutationChainRef.current;

      // With progress, hand off to /study/summary immediately — it owns the
      // session/end call itself, so the skeleton there covers the wait instead
      // of stacking a second loading screen on this page before navigating.
      if (hasProgress) {
        router.push("/study/summary");
        return;
      }

      const sessionId = sessionIdRef.current;
      try {
        if (sessionId != null) {
          await endStudySessionApi(sessionId);
          clearStoredSessionId(user.id);
        }
      } catch {
        // nothing to recover — the session just won't be marked ended server-side
      } finally {
        router.push("/dashboard");
      }
    },
    [router, user.id]
  );

  const refreshQueue = useCallback(async () => {
    try {
      const data = await getStudyQueue(user.id, settings, (wordsByKanjiId) => {
        setQueue((prev) => patchKanjiWords(prev, wordsByKanjiId));
      });
      const incoming = buildQueue(data);
      setNextDueAt(data.next_due_at);
      setPredictedTotal((t) => Math.max(t, data.predicted_total));
      setQueue((prev) => {
        const poolKeys = new Set(
          [...hiraganaDrillPoolRef.current, ...katakanaDrillPoolRef.current].map((c) => reviewKey(c))
        );
        const existingKeys = new Set([...prev.map((i) => i.key), ...poolKeys]);
        const rawAdditions = dropInFlightIntroCards(
          incoming.filter((i) => !existingKeys.has(i.key)),
          kanjiInFlightRef.current,
          vocabBatchInFlightRef.current
        );
        const additions = poolExtraDrillCards(rawAdditions, prev, hiraganaDrillPoolRef.current, katakanaDrillPoolRef.current, hiraganaInFlightRef.current, katakanaInFlightRef.current);
        return groupIntroBundles(mergeKeepingCurrent(prev, additions, isInProgressPackItem));
      });
    } catch {
      // periodic refresh failures shouldn't interrupt an active session
    }
  }, [user.id, settings, isInProgressPackItem]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const storedSessionId = getStoredSessionId(user.id);
      if (storedSessionId != null) {
        sessionIdRef.current = storedSessionId;
        // Restores how many cards were already completed in this still-open session (e.g.
        // after a page refresh), so the progress bar's numerator doesn't visually reset to 0
        // while the denominator (completedCount + the freshly fetched queue below) correctly
        // reflects only what's left.
        getSessionProgressApi(storedSessionId)
          .then((count) => {
            if (cancelled) return;
            setCompletedCount((c) => c + count);
          })
          .catch(() => {
            // Non-critical -- the bar just won't restore its prior progress this load.
          });
      } else {
        // Doesn't gate the first card -- rate()/introduceKanji()/introduceVocab() already
        // tolerate sessionIdRef being null until this lands, so it finishes in the
        // background instead of making the user wait on an extra insert before card 1 shows.
        startStudySessionApi(user.id)
          .then((started) => {
            if (cancelled) return;
            setStoredSessionId(user.id, started.session_id);
            sessionIdRef.current = started.session_id;
          })
          .catch(() => {
            // Reviews still submit without a session id attached; nothing to recover here.
          });
      }

      // Instant paint from localStorage -- written by prefetchFirstDueCard() (hover/focus on
      // a "Start studying" entry point) or by a previous /study mount below. Purely
      // provisional: it never sets `settled`, so the moment either real fetch below
      // resolves, its answer replaces this one -- the DB is always the final word on what
      // the first card actually is, this is only here so there's never a blank/skeleton
      // screen while that answer is in flight.
      const cachedCard = readFirstCardCache(user.id);
      if (cachedCard) {
        setQueue([{ key: reviewKey(cachedCard), kind: "review", card: cachedCard }]);
        setStatus("ready");
      }

      // Race a cheap single-card fetch against the full queue fetch -- whichever resolves
      // first gets to paint the first card, and `settled` stops the other from clobbering
      // it once one has. The full fetch is still what eventually backfills the rest of the
      // queue (and undo_disabled/next_due_at), merging in behind whatever's already shown.
      let settled = false;

      void getFirstDueCard(user.id, settings)
        .then((card) => {
          if (cancelled || settled) return;
          if (!card) {
            // The fast path can positively confirm a card, but not "there are none" -- that's
            // only true once the full fetch (which also checks new-material candidates)
            // agrees. Still worth dropping a stale cache entry so it isn't shown again.
            clearFirstCardCache(user.id);
            return;
          }
          settled = true;
          writeFirstCardCache(user.id, card);
          setQueue([{ key: reviewKey(card), kind: "review", card }]);
          setStatus("ready");
        })
        .catch(() => {
          // The full fetch below is authoritative and will surface any real error.
        });

      try {
        const data = await getStudyQueue(user.id, settings, (wordsByKanjiId) => {
          if (cancelled) return;
          setQueue((prev) => patchKanjiWords(prev, wordsByKanjiId));
        });
        if (cancelled) return;
        const items = reviewsFirst(buildQueue(data));
        setNextDueAt(data.next_due_at);
        setUndoDisabled(data.undo_disabled);
        setPredictedTotal((t) => Math.max(t, data.predicted_total));

        if (settled) {
          setQueue((prev) => {
            const poolKeys = new Set(
              [...hiraganaDrillPoolRef.current, ...katakanaDrillPoolRef.current].map((c) => reviewKey(c))
            );
            const existingKeys = new Set([...prev.map((i) => i.key), ...poolKeys]);
            const rawAdditions = dropInFlightIntroCards(
              items.filter((i) => !existingKeys.has(i.key)),
              kanjiInFlightRef.current,
              vocabBatchInFlightRef.current
            );
            const additions = poolExtraDrillCards(rawAdditions, prev, hiraganaDrillPoolRef.current, katakanaDrillPoolRef.current, hiraganaInFlightRef.current, katakanaInFlightRef.current);
            return groupIntroBundles(mergeKeepingCurrent(prev, additions, isInProgressPackItem));
          });
          return;
        }

        settled = true;
        // The very first paint of a full queue -- no `prev` to check for an already-visible
        // drill card, so pass an empty array (nothing's visible yet). hasFixedCurrent=false:
        // nothing is on screen yet either, so groupIntroBundles is free to reorder
        // items[0] too instead of treating reviewsFirst's shuffle as already-final.
        setQueue(
          groupIntroBundles(
            poolExtraDrillCards(items, [], hiraganaDrillPoolRef.current, katakanaDrillPoolRef.current, hiraganaInFlightRef.current, katakanaInFlightRef.current),
            false
          )
        );
        if (items.length === 0) {
          clearFirstCardCache(user.id);
          void endSession(false);
          return;
        }
        setStatus("ready");
      } catch (err) {
        if (cancelled || settled) return; // the fast path already painted real content
        setError(err instanceof ApiError ? err.message : "Could not load your study queue.");
        setStatus("error");
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
    // Mount-only: session/queue initialization must run exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (status === "ready") void refreshQueue();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status, refreshQueue]);

  // Refreshes right when the next scheduled card becomes due, rather than
  // waiting out the rest of the REFRESH_INTERVAL_MS poll. `clockOffsetMs` corrects the delay
  // for a wrong device clock -- nextDueAt is a server instant, so an uncorrected local clock
  // would schedule this too early or too late (bounded either way by the 45s poll above,
  // but there's no reason not to get it right). setTimeout itself already runs off the
  // browser's monotonic timer, so a clock change mid-wait can't shift an already-scheduled fire.
  useEffect(() => {
    if (status !== "ready" || !nextDueAt) return;
    const delay = new Date(nextDueAt).getTime() - (Date.now() + clockOffsetMs);
    if (delay <= 0) {
      void refreshQueue();
      return;
    }
    const timeout = setTimeout(() => void refreshQueue(), delay);
    return () => clearTimeout(timeout);
  }, [status, nextDueAt, clockOffsetMs, refreshQueue]);

  // Ends the session once the queue actually empties. Runs post-commit (not inside a
  // setQueue updater) so router.push doesn't fire a setState while StudyPage is rendering.
  useEffect(() => {
    if (status === "ready" && queue.length === 0 && !endingRef.current) {
      void endSession(hasProcessedAnyRef.current);
    }
  }, [status, queue, endSession]);

  const enqueueMutation = useCallback((mutate: () => Promise<void>) => {
    mutationChainRef.current = mutationChainRef.current.then(mutate, mutate);
  }, []);

  // Post-introduction drill for hiragana_reading/katakana_reading (record_hiragana_drill_result/
  // record_katakana_drill_result -- 20260827_hiragana_katakana_drill.sql): correct/incorrect
  // only, no rating, and -- unlike rate() below -- this never touches the normal SRS schedule or
  // review_logs. Draws the next card to show from the pool (hiragana/katakanaDrillPoolRef) the
  // instant this one is answered, same optimistic-swap feel used everywhere else in this hook --
  // except when the pool is empty, in which case (same reasoning as introduceKanaCard's last
  // pack card) this card stays on screen, disabled via pendingCardKey, until the server confirms
  // whether it graduated or needs to go around again.
  const submitDrillAnswer = useCallback(
    (card: DueCard, correct: boolean) => {
      const isHiragana = card.exercise_type === "hiragana_reading";
      const poolRef = isHiragana ? hiraganaDrillPoolRef : katakanaDrillPoolRef;
      const inFlightRef = isHiragana ? hiraganaInFlightRef : katakanaInFlightRef;
      const apiCall = isHiragana ? submitHiraganaDrillResultApi : submitKatakanaDrillResultApi;
      const itemId = isHiragana ? card.hiragana_id : card.katakana_id;
      const key = reviewKey(card);

      if (itemId == null) return; // shouldn't happen -- hiragana_reading/katakana_reading always carries its id

      hasProcessedAnyRef.current = true;
      setCompletedCount((c) => c + 1);
      // This card is about to leave `queue` (optimistic swap) or stays put but its fate is
      // pending (held) -- either way, mark it owned until resolved so a concurrent
      // refreshQueue poll doesn't mistake it for a fresh discovery (see poolExtraDrillCards).
      inFlightRef.current.add(itemId);

      let nextCard: DueCard | null = null;
      if (poolRef.current.length > 0) {
        const idx = Math.floor(Math.random() * poolRef.current.length);
        [nextCard] = poolRef.current.splice(idx, 1);
        const drawn = nextCard;
        setQueue((prev) => {
          const withoutItem = prev.filter((i) => i.key !== key);
          if (withoutItem.some((i) => i.key === reviewKey(drawn))) return withoutItem;
          return [{ key: reviewKey(drawn), kind: "review", card: drawn }, ...withoutItem];
        });
      } else {
        setPendingCardKey(key);
      }

      // Reshows the held card (it never left `queue`) with a fresh renderKey (see
      // QueueItem.renderKey) so ReviewCardKanaReading remounts instead of reusing the previous
      // attempt's revealed/typed-answer state -- used both when it needs another round and
      // when the submit itself failed and must be retried.
      const reshowHeldCard = () => {
        drillRetryCounterRef.current += 1;
        const renderKey = `${key}::retry${drillRetryCounterRef.current}`;
        setQueue((prev) => prev.map((i) => (i.key === key ? { ...i, renderKey } : i)));
      };

      enqueueMutation(async () => {
        try {
          const { graduated } = await apiCall(itemId, correct);
          // Same reasoning as rate()'s resurfaces_today check: computePredictedTotal counts
          // this card once, but a drill needs 3 correct answers in a row to graduate, so
          // anything short of that guarantees at least one more attempt today -- grow the
          // total now rather than let completedCount silently overtake it.
          if (!graduated) setPredictedTotal((t) => t + 1);
          if (nextCard) {
            if (!graduated) poolRef.current.push(card);
            inFlightRef.current.delete(itemId);
            return;
          }
          // This was the held-visible last-known card -- resolve it now.
          setPendingCardKey(null);
          if (graduated) setQueue((prev) => prev.filter((i) => i.key !== key));
          else reshowHeldCard();
          inFlightRef.current.delete(itemId);
        } catch (err) {
          setCompletedCount((c) => Math.max(0, c - 1));
          if (nextCard) {
            poolRef.current.push(card);
          } else {
            setPendingCardKey(null);
            reshowHeldCard();
          }
          inFlightRef.current.delete(itemId);
          showToast(err instanceof ApiError ? err.message : "Could not submit your answer. Please try again.", "error");
        }
      });
    },
    [enqueueMutation, showToast]
  );

  const rate = useCallback(
    (card: DueCard, rating: Rating) => {
      // hiragana_reading/katakana_reading cards still in the post-introduction drill
      // (status='learning') never go through the normal rating flow below -- see
      // submitDrillAnswer. rating is repurposed as a plain pass/fail signal here (>=2 matches
      // the same "correct" threshold submit_review already uses), since ReviewCardKanaReading's
      // drill mode grades purely on typed-answer correctness, with no Hard/Good/Easy picker.
      if (
        (card.exercise_type === "hiragana_reading" || card.exercise_type === "katakana_reading") &&
        card.status === "learning"
      ) {
        submitDrillAnswer(card, rating >= 2);
        return;
      }

      hasProcessedAnyRef.current = true;
      // Invalidated until the submit below actually confirms an id -- guards Undo against
      // firing on a stale id from an earlier review while this one is still in flight.
      lastReviewLogIdRef.current = null;
      setLastReview({ card });
      setCompletedCount((c) => c + 1);
      setQueue((prev) => prev.filter((i) => i.key !== reviewKey(card)));

      enqueueMutation(async () => {
        try {
          const { reviewLogId, resurfacesToday } = await submitReviewApi(
            reviewBody(card, rating, sessionIdRef.current ?? undefined)
          );
          lastReviewLogIdRef.current = reviewLogId;
          // computePredictedTotal only ever counts this card once -- it has no way to know in
          // advance whether the user will get it right the first time. submit_review's own
          // authoritative answer (the row's real new status, not a client-side guess) tells us
          // the instant it resolves whether this rating left the card still due again today --
          // if so, grow the total by the one extra attempt it now needs, otherwise
          // completedCount would silently overtake predictedTotal on any wrong answer, and the
          // bar could show "N/N" while a card the user just got wrong is still waiting to be
          // retried.
          if (resurfacesToday) setPredictedTotal((t) => t + 1);
          // A wrong answer can schedule this card to resurface later in the same session
          // (relearning steps) -- refetch so nextDueAt (and the progress-bar countdown)
          // picks that up immediately instead of waiting out the 45s poll.
          void refreshQueue();
        } catch (err) {
          setCompletedCount((c) => Math.max(0, c - 1));
          setLastReview((prev) => (prev?.card === card ? null : prev));
          // A 400/404 means the server rejected this specific card -- its progress row was
          // suspended, reset, or deleted (e.g. from /browse/ in another tab) since it was
          // queued here. Retrying would fail identically forever, so drop the card instead of
          // re-queuing it -- otherwise it re-fails every time it comes back up and the session
          // can never end if it was the last card left. Anything else (network blip, 500) is
          // presumed transient and worth retrying.
          const isStale = err instanceof ApiError && (err.status === 400 || err.status === 404);
          if (!isStale) setQueue((prev) => [{ key: reviewKey(card), kind: "review", card }, ...prev]);
          showToast(
            isStale
              ? "This card changed elsewhere and was skipped."
              : err instanceof ApiError
                ? err.message
                : "Could not submit your answer. Please try again.",
            "error"
          );
        }
      });
    },
    [enqueueMutation, showToast, refreshQueue, submitDrillAnswer]
  );

  const introduceCard = useCallback(
    (
      item: QueueItem & { kind: "new_kanji" | "new_vocab" },
      apiCall: (candidateId: number, sessionId?: number) => Promise<void>,
      noun: string
    ) => {
      hasProcessedAnyRef.current = true;
      setCompletedCount((c) => c + 1);
      setQueue((prev) => prev.filter((i) => i.key !== item.key));

      enqueueMutation(async () => {
        try {
          await apiCall(item.candidate.id, sessionIdRef.current ?? undefined);
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) return; // already introduced elsewhere — not a failure
          setCompletedCount((c) => Math.max(0, c - 1));
          setQueue((prev) => [item, ...prev]);
          showToast(err instanceof ApiError ? err.message : `Could not introduce this ${noun}. Please try again.`, "error");
        }
      });
    },
    [enqueueMutation, showToast]
  );

  // introduce_hiragana/introduce_katakana handle new_hiragana/new_katakana instead of the
  // generic introduceCard above, because finishing a whole gojuon pack (e.g. あ,い,う,え,お)
  // needs to hand the user its "Hiragana reading"/"Katakana reading" pack immediately after,
  // with nothing else ever shown in between -- see the two-part guarantee this maintains:
  //
  // 1. mergeKeepingCurrent (above) keeps a pack's remaining, not-yet-shown cards ahead of any
  //    review that becomes newly due mid-pack, once hiragana/katakanaActivePackRef marks the
  //    row active (set synchronously below, the moment its first card is tapped).
  //
  // 2. The pack's *last* card is the one moment this function does NOT optimistically remove
  //    the item from the queue: since cards are only ever shown/tapped one at a time, front to
  //    back, "no sibling from this row still sits in `queue`" can only be true for the very
  //    last tap of the pack -- every earlier one has, by construction, already been shown and
  //    removed. Holding that last card on screen (button disabled via pendingCardKey)
  //    until its reading pack has actually been fetched means the swap from "New Hiragana" to
  //    "Hiragana reading" happens as one atomic setQueue call, with no other card ever
  //    flashing in the gap while that fetch is in flight.
  const introduceKanaCard = useCallback(
    (
      kind: "hiragana" | "katakana",
      item: QueueItem & { kind: "new_hiragana" | "new_katakana" },
      apiCall: (candidateId: number, sessionId?: number) => Promise<void>,
      fetchReadingCards: (ids: number[]) => Promise<DueCard[]>,
      noun: string
    ) => {
      const activeSet = kind === "hiragana" ? hiraganaActivePackRef.current : katakanaActivePackRef.current;
      const doneMap = kind === "hiragana" ? hiraganaPackDoneRef.current : katakanaPackDoneRef.current;
      const row = item.candidate.gojuon_row;
      const isLastInPack = !queue.some(
        (i) => i.key !== item.key && i.kind === item.kind && i.candidate.gojuon_row === row
      );

      hasProcessedAnyRef.current = true;
      setCompletedCount((c) => c + 1);
      activeSet.add(row);

      if (isLastInPack) {
        setPendingCardKey(item.key);
      } else {
        setQueue((prev) => prev.filter((i) => i.key !== item.key));
      }

      const recordIntroduced = () => {
        const done = doneMap.get(row) ?? [];
        done.push(item.candidate.id);
        doneMap.set(row, done);
        return done;
      };

      const drillPoolRef = kind === "hiragana" ? hiraganaDrillPoolRef : katakanaDrillPoolRef;
      const drillInFlightRef = kind === "hiragana" ? hiraganaInFlightRef : katakanaInFlightRef;

      // Hands the pack straight into the post-introduction drill (submitDrillAnswer): only
      // one reading card is ever shown at a time, so this shuffles the freshly-fetched pack,
      // shows one, and stashes the rest in the pool -- submitDrillAnswer draws from it
      // (and refills it) as the user answers each one, until every character has graduated.
      const finishPack = async (ids: number[]) => {
        activeSet.delete(row);
        doneMap.delete(row);
        // Marked in-flight for the whole fetch: by now every row in `ids` already exists in
        // the DB (status='learning', due -- see introduce_hiragana/introduce_katakana) but
        // isn't reflected in `queue` or the pool yet -- see poolExtraDrillCards for why a
        // concurrent refreshQueue poll landing in this gap needs to know that.
        for (const id of ids) drillInFlightRef.current.add(id);
        const cards = await fetchReadingCards(ids).catch(() => [] as DueCard[]);
        setPendingCardKey(null);
        if (cards.length === 0) {
          setQueue((prev) => prev.filter((i) => i.key !== item.key));
          for (const id of ids) drillInFlightRef.current.delete(id);
          return;
        }
        const [first, ...restPool] = shuffle(cards);
        drillPoolRef.current.push(...restPool);
        setQueue((prev) => {
          const withoutItem = prev.filter((i) => i.key !== item.key);
          if (withoutItem.some((i) => i.key === reviewKey(first))) return withoutItem;
          return [{ key: reviewKey(first), kind: "review", card: first }, ...withoutItem];
        });
        for (const id of ids) drillInFlightRef.current.delete(id);
      };

      enqueueMutation(async () => {
        try {
          await apiCall(item.candidate.id, sessionIdRef.current ?? undefined);
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            // Already introduced elsewhere — not a failure, still counts toward the pack.
            const done = recordIntroduced();
            if (isLastInPack) await finishPack([...done]);
            return;
          }
          // Pack stays active either way (it isn't finished) -- only finishPack clears it,
          // once the pack actually completes.
          setCompletedCount((c) => Math.max(0, c - 1));
          if (isLastInPack) setPendingCardKey(null);
          else setQueue((prev) => [item, ...prev]);
          showToast(err instanceof ApiError ? err.message : `Could not introduce this ${noun}. Please try again.`, "error");
          return;
        }

        const done = recordIntroduced();
        if (isLastInPack) await finishPack([...done]);
      });
    },
    [enqueueMutation, showToast, queue]
  );

  // introduce_kanji handles new_kanji instead of the generic introduceCard above, because
  // (unlike new_vocab) finishing a "New kanji" card needs to hand the user its "Kanji meaning"
  // card and every "Word reading" card immediately after, with nothing else ever shown in
  // between -- see 20260828_pair_new_kanji_with_intro_bundle.sql. Unlike introduceKanaCard,
  // there's no multi-tap pack to track: introduce_kanji creates every row for the bundle (one
  // kanji_meaning_progress row, one kanji_reading_progress row per example word) in a single
  // RPC call, so this item is always "the last (only) tap" -- it's held on screen (button
  // disabled via pendingCardKey) until getKanjiIntroCards has actually fetched the fresh rows,
  // then the swap from "New kanji" to [Kanji meaning, then its shuffled Word reading cards]
  // happens as one atomic setQueue call, exactly like introduceKanaCard's finishPack.
  const introduceKanji = useCallback(
    (item: QueueItem & { kind: "new_kanji" }) => {
      const kanjiId = item.candidate.id;
      hasProcessedAnyRef.current = true;
      setCompletedCount((c) => c + 1);
      setPendingCardKey(item.key);
      kanjiInFlightRef.current.add(kanjiId);

      enqueueMutation(async () => {
        try {
          await introduceKanjiApi(kanjiId, sessionIdRef.current ?? undefined);
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 409)) {
            // Not "already introduced elsewhere" -- a real failure, nothing to hand off.
            kanjiInFlightRef.current.delete(kanjiId);
            setCompletedCount((c) => Math.max(0, c - 1));
            setPendingCardKey(null);
            showToast(err instanceof ApiError ? err.message : "Could not introduce this kanji. Please try again.", "error");
            return;
          }
          // 409: already introduced elsewhere -- its bundle still exists, hand it off below.
        }

        const cards = await getKanjiIntroCards(kanjiId).catch(() => [] as DueCard[]);
        kanjiInFlightRef.current.delete(kanjiId);
        setPendingCardKey(null);

        if (cards.length === 0) {
          setQueue((prev) => prev.filter((i) => i.key !== item.key));
          return;
        }

        const meaning = cards.filter((c) => c.exercise_type === "kanji_meaning");
        const readings = shuffle(cards.filter((c) => c.exercise_type === "kanji_reading"));
        const block = [...meaning, ...readings].map((card) => ({
          key: reviewKey(card),
          kind: "review" as const,
          card,
        }));

        setQueue((prev) => {
          const withoutItem = prev.filter((i) => i.key !== item.key);
          const existingKeys = new Set(withoutItem.map((i) => i.key));
          const newBlock = block.filter((i) => !existingKeys.has(i.key));
          return [...newBlock, ...withoutItem];
        });
      });
    },
    [enqueueMutation, showToast]
  );

  // introduce_vocabulary handles new_vocab specially only for the LAST "New vocabulary" card
  // still in the queue -- every earlier tap uses the plain introduceCard path above (optimistic
  // removal, no special handling), same as this used to behave for every tap before batching.
  // Once no other new_vocab candidate remains in the queue, this tap is the one that completes
  // today's whole batch: introduce_vocabulary itself only ever marks the new row pending_batch
  // (never touches due_at in a way that would surface it early -- see
  // 20260830_vocab_batch_pending_flag.sql), so this call separately fires completeVocabBatch
  // right after, which atomically releases every still-pending row for this user and hands them
  // back -- so, like introduceKanji/introduceKanaCard's finishPack, this is held on screen
  // (button disabled via pendingCardKey) until that fetch actually resolves, then the swap from
  // the last "New vocabulary" card to the whole shuffled "Vocabulary" batch happens as one
  // atomic setQueue call.
  const introduceVocab = useCallback(
    (item: QueueItem & { kind: "new_vocab" }) => {
      const isLastInBatch = !queue.some((i) => i.key !== item.key && i.kind === "new_vocab");
      if (!isLastInBatch) {
        introduceCard(item, introduceVocabularyApi, "word");
        return;
      }

      hasProcessedAnyRef.current = true;
      setCompletedCount((c) => c + 1);
      setPendingCardKey(item.key);
      vocabBatchInFlightRef.current = true;

      enqueueMutation(async () => {
        try {
          await introduceVocabularyApi(item.candidate.id, sessionIdRef.current ?? undefined);
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 409)) {
            vocabBatchInFlightRef.current = false;
            setCompletedCount((c) => Math.max(0, c - 1));
            setPendingCardKey(null);
            showToast(err instanceof ApiError ? err.message : "Could not introduce this word. Please try again.", "error");
            return;
          }
          // 409: already introduced elsewhere -- whatever's pending (including that word,
          // introduced from another tab) still needs releasing, hand it off below.
        }

        const cards = await completeVocabBatch().catch(() => [] as DueCard[]);
        vocabBatchInFlightRef.current = false;
        setPendingCardKey(null);

        if (cards.length === 0) {
          setQueue((prev) => prev.filter((i) => i.key !== item.key));
          return;
        }

        const block = shuffle(cards).map((card) => ({ key: reviewKey(card), kind: "review" as const, card }));

        setQueue((prev) => {
          const withoutItem = prev.filter((i) => i.key !== item.key);
          const existingKeys = new Set(withoutItem.map((i) => i.key));
          const newBlock = block.filter((i) => !existingKeys.has(i.key));
          return [...newBlock, ...withoutItem];
        });
      });
    },
    [enqueueMutation, showToast, introduceCard, queue]
  );

  const introduceHiragana = useCallback(
    (item: QueueItem & { kind: "new_hiragana" }) =>
      introduceKanaCard("hiragana", item, introduceHiraganaApi, getHiraganaReadingCards, "hiragana character"),
    [introduceKanaCard]
  );

  const introduceKatakana = useCallback(
    (item: QueueItem & { kind: "new_katakana" }) =>
      introduceKanaCard("katakana", item, introduceKatakanaApi, getKatakanaReadingCards, "katakana character"),
    [introduceKanaCard]
  );

  const undoLast = useCallback(() => {
    if (!lastReview || undoDisabled) return;
    const toUndo = lastReview;
    setUndoPending(true);

    // Chained behind rate()/introduceKanji()/introduceVocab() so the review being undone
    // has definitely landed on the server before the undo request fires.
    enqueueMutation(async () => {
      // Read only now that the chain has caught up: if the submit this undo targets failed,
      // or a previous queued undo already consumed it, this is null and there is nothing to
      // undo -- calling the API anyway would fall back to "undo the latest review" server-side
      // and silently revert an unrelated card while re-queuing this one a second time.
      const reviewLogId = lastReviewLogIdRef.current;
      if (reviewLogId == null) {
        setUndoPending(false);
        return;
      }

      try {
        await undoReviewApi(reviewLogId);
        lastReviewLogIdRef.current = null;
        setCompletedCount((c) => Math.max(0, c - 1));
        setQueue((prev) => [{ key: reviewKey(toUndo.card), kind: "review", card: toUndo.card }, ...prev]);
        setLastReview((prev) => (prev === toUndo ? null : prev));
      } catch (err) {
        // A 404 means this review is already undone (e.g. from another tab) -- there's
        // nothing left to undo, so clear it instead of leaving an Undo pill that would
        // just fail the same way on every retry.
        if (err instanceof ApiError && err.status === 404) {
          lastReviewLogIdRef.current = null;
          setLastReview((prev) => (prev === toUndo ? null : prev));
        }
        showToast(err instanceof ApiError ? err.message : "Could not undo your last answer.", "error");
      } finally {
        setUndoPending(false);
      }
    });
  }, [enqueueMutation, lastReview, showToast, undoDisabled]);

  return {
    status,
    error,
    current: queue[0] ?? null,
    completedCount,
    // predictedTotal already counts every future card the app can see coming (see its
    // declaration above), so it doesn't need queue.length or pendingCardKey bookkeeping the way
    // the old completedCount + queue.length scheme did. The Math.max floor is just a safety net
    // for the brief window right after something genuinely unpredictable becomes due (a
    // learning-step retry) but before the next refreshQueue poll has re-fetched a
    // predictedTotal that accounts for it -- without it, completedCount could transiently
    // exceed predictedTotal and show something like "6/5".
    totalKnown: Math.max(predictedTotal, completedCount),
    nextDueAt,
    clockOffsetMs,
    lastReview,
    actionPending: undoPending,
    // True when `current` is a held card awaiting a result -- either a pack-completing
    // new_hiragana/new_katakana card (introduceKanaCard) or a drill card answered when the
    // pool was empty (submitDrillAnswer). The page disables that card's button with this so
    // the same tap can't fire twice while the swap is in flight.
    cardPending: pendingCardKey !== null && queue[0]?.key === pendingCardKey,
    undoDisabled,
    actions: { rate, introduceKanji, introduceVocab, introduceHiragana, introduceKatakana, undoLast },
  };
}
