"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import {
  checkJlptLevelUp as checkJlptLevelUpApi,
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
  introduceHiraganaRule as introduceHiraganaRuleApi,
  introduceKatakanaRule as introduceKatakanaRuleApi,
  startSession as startStudySessionApi,
  submitHiraganaDrillResult as submitHiraganaDrillResultApi,
  submitKatakanaDrillResult as submitKatakanaDrillResultApi,
  submitReview as submitReviewApi,
  undoReview as undoReviewApi,
  type KanaPackResult,
} from "@/lib/client-data/study";
import { fetchHiraganaMastered, fetchKatakanaMastered, refreshStudySettings } from "@/lib/client-data/studySettings";
import { useStudyOnboarding } from "@/lib/study/StudyOnboardingContext";
import { useServerClockOffset } from "@/lib/client-data/serverClockOffset";
import { clearFirstCardCache, readFirstCardCache, writeFirstCardCache } from "@/lib/study/firstCardCache";
import { hasCelebratedMaxLevel, markMaxLevelCelebrated } from "@/lib/study/levelUpCache";
import { useToast } from "@/app/components/ui/Toast";
import { clearStoredSessionId, getStoredSessionId, setStoredSessionId } from "@/lib/study/session";
import type {
  DueCard,
  JlptLevelUpResult,
  KanaGraduationKind,
  NewKanjiIntroWord,
  Rating,
  ReviewRequestBody,
  StudyQueueResponse,
} from "@/lib/types";
import {
  newKanjiKey,
  newVocabKey,
  newHiraganaKey,
  newKatakanaKey,
  newHiraganaRuleKey,
  newKatakanaRuleKey,
  reviewKey,
  type QueueItem,
} from "./types";

const REFRESH_INTERVAL_MS = 45_000;

type Status = "loading" | "ready" | "ending" | "error";

interface LastReview {
  card: DueCard;
}

// Merges a script's character-pack candidates with its rule candidates into one sequence ordered
// by sort_order -- get_new_hiragana_candidates/get_new_katakana_candidates and
// get_new_hiragana_rule_candidates/get_new_katakana_rule_candidates (20260904_kana_rule_cards.sql)
// are two separate result sets, each already sorted within itself, but a rule (e.g. the dakuten
// rule) is only meaningful shown right before the characters it explains (だ/ば/ざ...) -- so
// buildQueue interleaves them here rather than appending rule items as their own trailing block
// the way new_kanji/new_vocab are appended below.
function sortItemsBySortOrder(items: { sortOrder: number; item: QueueItem }[]): QueueItem[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.item);
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

  const hiraganaEntries: { sortOrder: number; item: QueueItem }[] = [
    ...data.new_hiragana_to_introduce.map((candidate) => ({
      sortOrder: candidate.sort_order,
      item: { key: newHiraganaKey(candidate.id), kind: "new_hiragana" as const, candidate },
    })),
    ...data.new_hiragana_rules_to_introduce.map((candidate) => ({
      sortOrder: candidate.sort_order,
      item: { key: newHiraganaRuleKey(candidate.id), kind: "new_hiragana_rule" as const, candidate },
    })),
  ];
  items.push(...sortItemsBySortOrder(hiraganaEntries));

  const katakanaEntries: { sortOrder: number; item: QueueItem }[] = [
    ...data.new_katakana_to_introduce.map((candidate) => ({
      sortOrder: candidate.sort_order,
      item: { key: newKatakanaKey(candidate.id), kind: "new_katakana" as const, candidate },
    })),
    ...data.new_katakana_rules_to_introduce.map((candidate) => ({
      sortOrder: candidate.sort_order,
      item: { key: newKatakanaRuleKey(candidate.id), kind: "new_katakana_rule" as const, candidate },
    })),
  ];
  items.push(...sortItemsBySortOrder(katakanaEntries));

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

// gojuon_row pack key for a new_hiragana/new_katakana item, scoped by kind so a hiragana pack and
// a katakana pack sharing the same gojuon_row name are never confused (both scripts can have
// candidates queued at once once katakana auto-activates) -- null for anything else. Derived
// purely from the item's own data, not from any session-tracked ref, so it's safe to use for
// display-order decisions without reintroducing the cross-session bug pack_pending already fixed
// (see 20260910_persist_kana_pack_completion.sql) -- this never decides whether a pack is
// "complete", only how already-known items sort relative to each other in one render.
function newKanaPackKey(item: QueueItem): string | null {
  if (item.kind === "new_hiragana") return `hiragana:${item.candidate.gojuon_row}`;
  if (item.kind === "new_katakana") return `katakana:${item.candidate.gojuon_row}`;
  return null;
}

// Same priority, but leaves the card currently on screen in place so a merge never
// yanks it out from under the user mid-answer, and leaves already-queued cards in place too --
// only newly-fetched review additions get shuffled in (new-material additions keep DB order,
// same reasoning as reviewsFirst), so the rest of the queue doesn't visibly reorder itself out
// from under the user on every poll. Already-queued new material (restNew) stays ahead of
// anything newly discovered by this merge (addNew), same "already-queued beats
// newly-discovered" rule reviews get.
//
// One exception: if `current` is itself a new_hiragana/new_katakana tap the user hasn't finished
// yet (mid gojuon-row pack), that pack's own remaining, not-yet-tapped siblings (restSamePack)
// are kept directly behind it, ahead of anything newly discovered by this merge -- including a
// review that just became due (addReviews). Without this, a character mastered long ago coming
// due again mid-pack would splice in between two taps of the SAME pack (e.g. between あ and い),
// breaking the "5 New hiragana taps back to back, then their reading drill, nothing else in
// between" guarantee -- see introduceKanaCard. Only the not-yet-tapped candidates need this: once
// a pack's reading drill actually starts, its cards are drawn straight from
// hiragana/katakanaDrillPoolRef (see submitDrillAnswer), never through this merge at all, so
// they're never at risk of being reordered behind a newly-discovered review either.
function mergeKeepingCurrent(prev: QueueItem[], additions: QueueItem[]): QueueItem[] {
  if (prev.length === 0) return reviewsFirst(additions);
  const [current, ...rest] = prev;
  const currentPackKey = newKanaPackKey(current);
  const restReviews = rest.filter((i) => i.kind === "review");
  const restNew = rest.filter((i) => i.kind !== "review");
  const restSamePack = currentPackKey == null ? [] : restNew.filter((i) => newKanaPackKey(i) === currentPackKey);
  const restOtherNew = currentPackKey == null ? restNew : restNew.filter((i) => newKanaPackKey(i) !== currentPackKey);
  const addReviews = shuffle(additions.filter((i) => i.kind === "review"));
  const addNew = additions.filter((i) => i.kind !== "review");
  return [current, ...restReviews, ...restSamePack, ...addReviews, ...restOtherNew, ...addNew];
}

// A hiragana_reading/katakana_reading card still in the post-introduction drill (card.drill_mode
// -- server-computed, see its doc comment in lib/types/study.ts) -- answered right or wrong, it
// keeps coming back until it's graduated. At most one such card is ever shown at a time; the rest
// sit in hiragana/katakanaDrillPoolRef and get drawn at random as the visible one is answered.
function isDrillCard(item: QueueItem): item is QueueItem & { kind: "review" } {
  return item.kind === "review" && item.card.drill_mode;
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

// kana_types whose entry_kind = 'example' rows get batch-introduced together
// (introduceHiraganaExamples/introduceKatakanaExamples, fetchStudyQueue) and should stay grouped
// in the queue the same way -- deliberately excludes 'seion' (handled entirely differently, via
// the drill pool -- see isDrillCard/submitDrillAnswer) and 'dakuten'/'handakuten' (real
// entry_kind = 'character' rows, already packed and pushed as one block per gojuon_row by
// introduceKanaCard's finishPack, which stays contiguous on its own without needing this).
const KANA_EXAMPLE_BUNDLE_TYPES = new Set(["sokuon", "yoon", "n_gemination", "choonpu", "extended"]);

// A still-learning kanji_meaning/kanji_reading card is part of a kanji's not-yet-completed
// intro bundle (see introduceKanji below and 20260828_pair_new_kanji_with_intro_bundle.sql), a
// still-learning vocab_meaning card is part of today's not-yet-completed vocab batch, and a
// still-learning hiragana_reading/katakana_reading card whose kana_type is one of
// KANA_EXAMPLE_BUNDLE_TYPES is part of that kana_type's example pack (20260906_pack_examples_by_kana_type.sql)
// -- once any of these graduates to status='review' it's just a normal independent review again,
// and drops out of its group. Unlike seion's drill, there's no separate "still drilling" flag
// needed for any of these: a row simply never leaves 'learning' until it actually graduates
// through the normal rating flow.
function introBundleKey(item: QueueItem): string | null {
  if (item.kind !== "review") return null;
  const { card } = item;
  if (card.status !== "learning") return null;
  if (card.exercise_type === "kanji_meaning" || card.exercise_type === "kanji_reading") {
    return `kanji-${card.kanji_id}`;
  }
  if (card.exercise_type === "vocab_meaning") return VOCAB_BATCH_KEY;
  if (
    (card.exercise_type === "hiragana_reading" || card.exercise_type === "katakana_reading") &&
    card.kana_type != null &&
    KANA_EXAMPLE_BUNDLE_TYPES.has(card.kana_type)
  ) {
    return `kana-example-${card.exercise_type}-${card.kana_type}`;
  }
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

// Drops any freshly-fetched review row this session has already rated (see attemptedKeysRef in
// useStudyQueue) -- a wrong answer schedules a resurface later today, but that resurface belongs
// to a FUTURE session, not this one: without this filter, a slow-enough session would see its own
// just-failed cards wander back into `queue` the moment their due_at actually arrives, exactly
// like any other newly-due card, undoing the "answering a card never grows the denominator"
// guarantee below.
function dropAttemptedThisSession(additions: QueueItem[], attemptedKeys: Set<string>): QueueItem[] {
  return additions.filter((item) => item.kind !== "review" || !attemptedKeys.has(item.key));
}

// Same reasoning, applied to the total instead of the queue: computePredictedTotal's dueCardCount
// (server-side) counts every due_at<=now() row with no idea which ones this session already
// rated -- so a just-failed card that has since crossed back into "due now" would otherwise still
// inflate predicted_total the moment refreshQueue's Math.max recompute picks it up, even though
// dropAttemptedThisSession above keeps it out of `queue`. Subtracting how many of the fetch's own
// due_cards are attempted-this-session rows cancels exactly that inflation, and only that --
// candidates (new kanji/vocab/kana) are never in attemptedKeysRef, so their contribution is
// untouched.
function adjustedPredictedTotal(data: StudyQueueResponse, attemptedKeys: Set<string>): number {
  const staleDueCount = data.due_cards.filter((c) => attemptedKeys.has(reviewKey(c))).length;
  return data.predicted_total - staleDueCount;
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

  // The vocab batch and each kana-example pack are one flat shuffled list; a kanji bundle keeps
  // its meaning card first, then shuffles only its reading cards.
  const orderBundle = (key: string): QueueItem[] => {
    const group = groups.get(key) ?? [];
    if (key === VOCAB_BATCH_KEY || key.startsWith("kana-example-")) return shuffle(group);
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
    head.push(items[0]);
    placed.add(items[0]);
    if (headKey != null) {
      // orderBundle reshuffles its whole group on every call (that's the point, for the
      // siblings) -- but items[0] is already on screen and must stay first, so it's pinned
      // above and explicitly skipped here rather than let the shuffle place it anywhere in
      // `head`. Without this, every refreshQueue merge while the bundle is still incomplete
      // (i.e. for the entire time the user is answering it) would have a real chance of
      // silently swapping the visible card for a sibling the instant this runs -- no click,
      // no card-count change, just the word/kanji on screen changing under the user.
      for (const item of orderBundle(headKey)) {
        if (item === items[0]) continue;
        head.push(item);
        placed.add(item);
      }
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
  // Always-current mirror of `settings`, read (not subscribed to) from checkKanaGraduation below
  // -- lets that callback compare "settings just before this review" against a fresh refetch
  // without needing `settings` in its own dependency array (same reasoning as every other *Ref in
  // this hook: a plain closure over `settings` would go stale between renders).
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  // Whether every hiragana character was mastered as of the last check -- study_katakana no
  // longer flips the instant hiragana is mastered (it now also needs the reading test passed, see
  // 20260915_reading_test_gates_katakana.sql), so checkKanaGraduation can't detect "hiragana just
  // finished" from settings alone anymore. Fetched once on mount and refreshed by
  // checkKanaGraduation itself below; same "ref mirrors async state" pattern as settingsRef.
  const hiraganaMasteredRef = useRef(false);
  useEffect(() => {
    fetchHiraganaMastered(user.id)
      .then((mastered) => {
        hiraganaMasteredRef.current = mastered;
      })
      .catch(() => {
        // Leaves it at false -- worst case, a student whose hiragana was already mastered before
        // this loaded sees the "Hiragana mastered!" modal fire once more than it should.
      });
  }, [user.id]);
  // Same as hiraganaMasteredRef above, for katakana -- study_track no longer flips the instant
  // katakana is mastered either (it now also needs the katakana reading test passed, see
  // 20260920_reading_test_gates_standard.sql).
  const katakanaMasteredRef = useRef(false);
  useEffect(() => {
    fetchKatakanaMastered(user.id)
      .then((mastered) => {
        katakanaMasteredRef.current = mastered;
      })
      .catch(() => {
        // Leaves it at false -- same reasoning as hiraganaMasteredRef above.
      });
  }, [user.id]);
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
  // dip from ever being visible.
  //
  // A card THIS session already rated never raises it again, no matter what its due_at does --
  // see attemptedKeysRef/adjustedPredictedTotal below: rate()'s only guarantee is that totalKnown
  // is always reachable within the session you're actually in, so a wrong answer's resurface is a
  // future session's concern, not a reason to chase a growing denominator right now. A genuinely
  // independent discovery -- a "review"-status card that was never touched this session, or new
  // material -- still raises it, with the usual "+N" badge in QueueProgressBar.
  const [predictedTotal, setPredictedTotal] = useState(0);
  const [nextDueAt, setNextDueAt] = useState<string | null>(null);
  // Status of the row nextDueAt belongs to -- see next_due_status in lib/types/study.ts. Drives
  // whether QueueProgressBar's countdown is worth showing: 'learning'/'relearning' is an SRS
  // retry from something already attempted this session (see attemptedKeysRef -- it's done for
  // the session and can't raise totalKnown again, so announcing its comeback is just noise);
  // 'review' is an independent card becoming due on its own, which nothing else here announces.
  const [nextDueStatus, setNextDueStatus] = useState<string | null>(null);
  const [lastReview, setLastReview] = useState<LastReview | null>(null);
  const [undoPending, setUndoPending] = useState(false);
  const [undoDisabled, setUndoDisabled] = useState(false);
  // Set right after a kanji_meaning/kanji_reading/vocab_meaning review turns out to have just
  // finished the user's current JLPT level (see checkLevelUp below) -- StudyPage renders
  // JlptLevelUpModal whenever this is non-null, and dismissLevelUp clears it back to null.
  const [levelUpResult, setLevelUpResult] = useState<JlptLevelUpResult | null>(null);
  // Same idea as levelUpResult, but for the kana track's two milestones (see checkKanaGraduation
  // below) -- StudyPage renders KanaGraduationModal whenever this is non-null.
  const [kanaGraduationResult, setKanaGraduationResult] = useState<KanaGraduationKind | null>(null);
  // Key of the one card currently held on screen instead of being optimistically removed -- a
  // new_hiragana/new_katakana tap (see introduceKanaCard, held on every tap so the reading pack
  // can swap in atomically with no flash of the next pack's own card), a drill card (see
  // submitDrillAnswer) answered when no other pool card was left to swap in, or a new_kanji tap
  // (see introduceKanji, always a single-shot hold). Held so the page can disable its button and
  // avoid a double-submit while the result is still in flight.
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
  // reviewKey()s of every kanji_meaning/kanji_reading/vocab_meaning card rate() has already
  // submitted this session (right or wrong) -- NOT populated for hiragana/katakana drill cards,
  // which keep their own separate re-surfacing behavior via submitDrillAnswer/the pool refs
  // above. A card added here is done for this session: once its rating schedules it to resurface
  // later today (a wrong answer, or a "review" card regressing to "relearning"), it must NOT
  // re-enter `queue` or grow `predictedTotal` again before the session ends, even if its due_at
  // actually arrives while the session is still open -- see refreshQueue/init's filtering below.
  // A failed submit removes its key again (in rate()'s catch block) so the retry is treated
  // normally. This is what guarantees totalKnown is always reachable: nothing you've already
  // answered can silently reappear and push the denominator further away.
  const attemptedKeysRef = useRef<Set<string>>(new Set());

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
      setNextDueStatus(data.next_due_status);
      setPredictedTotal((t) => Math.max(t, adjustedPredictedTotal(data, attemptedKeysRef.current)));
      setQueue((prev) => {
        const poolKeys = new Set(
          [...hiraganaDrillPoolRef.current, ...katakanaDrillPoolRef.current].map((c) => reviewKey(c))
        );
        const existingKeys = new Set([...prev.map((i) => i.key), ...poolKeys]);
        const rawAdditions = dropAttemptedThisSession(
          dropInFlightIntroCards(
            incoming.filter((i) => !existingKeys.has(i.key)),
            kanjiInFlightRef.current,
            vocabBatchInFlightRef.current
          ),
          attemptedKeysRef.current
        );
        const additions = poolExtraDrillCards(rawAdditions, prev, hiraganaDrillPoolRef.current, katakanaDrillPoolRef.current, hiraganaInFlightRef.current, katakanaInFlightRef.current);
        return groupIntroBundles(mergeKeepingCurrent(prev, additions));
      });
    } catch {
      // periodic refresh failures shouldn't interrupt an active session
    }
  }, [user.id, settings]);

  // React Strict Mode (dev only) mounts this effect, cleans it up, then mounts it again --
  // synchronously, before init()'s own network calls settle. Without a guard, init() would run
  // twice and fire every one of its RPCs (session start, introduce_hiragana_examples/
  // introduce_katakana_examples...) twice for real, since an already-sent request can't be
  // un-sent just because React discarded its result. That's exactly what caused a card to be
  // silently introduced by the first (discarded) run while the second run's own due-cards
  // snapshot -- taken too early to see it -- found nothing and redirected to /dashboard.
  // initStartedRef makes init() itself run only once per mount: deliberately never reset in the
  // cleanup below, so it stays true across Strict Mode's synthetic replay (same component
  // instance, same ref) but starts fresh (false) on a genuine unmount+remount (a new instance,
  // a new ref). cancelledRef is reset to false at the top of every firing, including the
  // replay -- so the one real init() call (started by the first firing) still sees
  // cancelled = false by the time its awaits resolve, and only a genuine later unmount (with no
  // following replay to reset it) leaves it true for good.
  const initStartedRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

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
            if (cancelledRef.current) return;
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
            if (cancelledRef.current) return;
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
          if (cancelledRef.current || settled) return;
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
          if (cancelledRef.current) return;
          setQueue((prev) => patchKanjiWords(prev, wordsByKanjiId));
        });
        if (cancelledRef.current) return;
        const items = reviewsFirst(buildQueue(data));
        setNextDueAt(data.next_due_at);
        setNextDueStatus(data.next_due_status);
        setUndoDisabled(data.undo_disabled);
        setPredictedTotal((t) => Math.max(t, adjustedPredictedTotal(data, attemptedKeysRef.current)));

        if (settled) {
          setQueue((prev) => {
            const poolKeys = new Set(
              [...hiraganaDrillPoolRef.current, ...katakanaDrillPoolRef.current].map((c) => reviewKey(c))
            );
            const existingKeys = new Set([...prev.map((i) => i.key), ...poolKeys]);
            const rawAdditions = dropAttemptedThisSession(
              dropInFlightIntroCards(
                items.filter((i) => !existingKeys.has(i.key)),
                kanjiInFlightRef.current,
                vocabBatchInFlightRef.current
              ),
              attemptedKeysRef.current
            );
            const additions = poolExtraDrillCards(rawAdditions, prev, hiraganaDrillPoolRef.current, katakanaDrillPoolRef.current, hiraganaInFlightRef.current, katakanaInFlightRef.current);
            return groupIntroBundles(mergeKeepingCurrent(prev, additions));
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
        if (cancelledRef.current || settled) return; // the fast path already painted real content
        setError(err instanceof ApiError ? err.message : "Could not load your study queue.");
        setStatus("error");
      }
    }

    if (!initStartedRef.current) {
      initStartedRef.current = true;
      void init();
    }
    return () => {
      cancelledRef.current = true;
    };
    // Mount-only: session/queue initialization must run exactly once -- initStartedRef (never
    // reset here) is what actually enforces that under Strict Mode's replay. This cleanup's
    // cancelledRef flip still runs on every firing, replay included -- harmless, since the
    // replay's own top-of-effect reset cancels it back out unless this was the real, final
    // unmount.
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
  //
  // Ending immediately (rather than waiting out a same-session learning-step retry, e.g. right
  // after answering the last card wrong) is intentional, not a bug: there's no "hold the page
  // open and wait" mode here -- /study/summary is the product's actual answer to "when do I come
  // back", via its own next_due_at/next_due_is_today (endStudySession calls the same get_next_due
  // this page does -- see studySessions.ts). That RPC used to never look at
  // user_hiragana_progress/user_katakana_progress at all, so a kana-track account always got
  // next_due_at = null there regardless of what was really coming due -- fixed at the source in
  // 20260922_get_next_due_includes_kana.sql instead of worked around here.
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
      // when the submit itself failed and must be retried. drillStreak carries the server's
      // freshly-confirmed streak onto the reshown card so its own next Check (see
      // ReviewCardKanaReading's streak indicator) counts up from the real value instead of the
      // stale one this card was originally fetched with.
      const reshowHeldCard = (drillStreak: number) => {
        drillRetryCounterRef.current += 1;
        const renderKey = `${key}::retry${drillRetryCounterRef.current}`;
        setQueue((prev) =>
          prev.map((i) =>
            i.key === key && i.kind === "review" ? { ...i, renderKey, card: { ...i.card, drill_streak: drillStreak } } : i
          )
        );
      };

      enqueueMutation(async () => {
        try {
          const { drillStreak, graduated } = await apiCall(itemId, correct);
          // Deliberately NOT the same as rate()'s attemptedKeysRef treatment below -- a drill
          // round trip is seconds, not minutes, so unlike a kanji/vocab retry it's realistic to
          // finish the whole drill (3 correct in a row) inside this same session. computePredictedTotal
          // counts this card once, but anything short of graduating guarantees at least one more
          // attempt today -- grow the total now rather than let completedCount silently overtake
          // it.
          if (!graduated) setPredictedTotal((t) => t + 1);
          if (nextCard) {
            if (!graduated) poolRef.current.push({ ...card, drill_streak: drillStreak });
            inFlightRef.current.delete(itemId);
            return;
          }
          // This was the held-visible last-known card -- resolve it now.
          setPendingCardKey(null);
          if (graduated) setQueue((prev) => prev.filter((i) => i.key !== key));
          else reshowHeldCard(drillStreak);
          inFlightRef.current.delete(itemId);
        } catch (err) {
          setCompletedCount((c) => Math.max(0, c - 1));
          if (nextCard) {
            poolRef.current.push(card);
          } else {
            setPendingCardKey(null);
            reshowHeldCard(card.drill_streak ?? 0);
          }
          inFlightRef.current.delete(itemId);
          showToast(err instanceof ApiError ? err.message : "Could not submit your answer. Please try again.", "error");
        }
      });
    },
    [enqueueMutation, showToast]
  );

  // Checks whether the review just submitted (kanji_meaning/kanji_reading/vocab_meaning only --
  // hiragana/katakana reviews can never affect a JLPT level) finished the user's current JLPT
  // level -- see check_and_advance_jlpt_level. Fire-and-forget: failures here shouldn't interrupt
  // the review flow, and a missed check just means the celebration (and the settings resync)
  // waits for the next relevant review.
  const checkLevelUp = useCallback(
    (exerciseType: DueCard["exercise_type"]) => {
      if (exerciseType !== "kanji_meaning" && exerciseType !== "kanji_reading" && exerciseType !== "vocab_meaning") return;
      checkJlptLevelUpApi(user.id)
        .then((result) => {
          if (!result.leveledUp) return;
          if (result.isMaxLevel) {
            // check_and_advance_jlpt_level keeps reporting this on every future call once N1 is
            // fully learned (there's nothing further to advance to that would naturally stop it)
            // -- this client-side flag is what keeps the modal from reappearing on every review.
            if (hasCelebratedMaxLevel(user.id)) return;
            markMaxLevelCelebrated(user.id);
            setLevelUpResult(result);
            return;
          }
          setLevelUpResult(result);
          // The DB-side advance already committed -- this just resyncs /study's own `settings`
          // (StudyLayout -> useStudyOnboarding) so the very next queue fetch already asks for the
          // new level's candidates instead of waiting for a full page reload.
          void refreshStudySettings(user.id).catch(() => {
            // Non-critical -- see comment above.
          });
        })
        .catch(() => {
          // Non-critical -- see comment above.
        });
    },
    [user.id]
  );

  const dismissLevelUp = useCallback(() => setLevelUpResult(null), []);

  // Checks whether the review just submitted (hiragana_reading/katakana_reading only) just
  // crossed one of the kana track's two milestones -- both are already applied server-side as a
  // side effect of the same submit_review call that graded this card (hiragana_auto_activate_katakana/
  // katakana_auto_activate_standard triggers on user_hiragana_progress/user_katakana_progress),
  // so this is purely detection: compare the settings snapshot from just before this review
  // against a fresh refetch, and see which (if either) flag flipped.
  //
  // Unlike checkLevelUp's isMaxLevel case, neither transition here needs a client-side "already
  // celebrated" flag -- study_katakana and study_track are real, durable flags that can only
  // flip false->true (or 'kana'->'standard') once per genuine completion; comparing against the
  // immediately-prior snapshot is enough to fire exactly once per transition, including a
  // legitimate second time if hiragana regresses (hiragana_regression_disables_katakana) and is
  // later re-mastered.
  const checkKanaGraduation = useCallback(
    (exerciseType: DueCard["exercise_type"]) => {
      if (exerciseType !== "hiragana_reading" && exerciseType !== "katakana_reading") return;
      const before = settingsRef.current;
      if (before.study_track !== "kana") return;

      // Full kana curriculum done -- driven by study_track flipping to 'standard'
      // (katakana_auto_activate_standard). In the normal order (katakana mastered, then its
      // reading test passed on a later visit to /study/test/katakana) that flip happens off this
      // review entirely (see reading_test_progress_activates_standard,
      // 20260920_reading_test_gates_standard.sql) and this check below just finds nothing new;
      // it only actually fires here for the atypical order -- test passed before the last
      // katakana character was mastered, so THIS review is what completes the gate.
      refreshStudySettings(user.id)
        .then((fresh) => {
          if (fresh.study_track === "standard") {
            setKanaGraduationResult("katakana_complete");
          }
        })
        .catch(() => {
          // Non-critical -- see checkLevelUp's identical reasoning above.
        });

      // Hiragana just mastered -- no longer detectable via study_katakana (that now waits on the
      // reading test too, see hiraganaMasteredRef's own comment above), so this compares
      // fetchHiraganaMastered's own false->true transition instead. Only worth checking after a
      // hiragana_reading review, and only while it hasn't already fired once.
      if (exerciseType === "hiragana_reading" && !hiraganaMasteredRef.current) {
        fetchHiraganaMastered(user.id)
          .then((masteredNow) => {
            if (masteredNow && !hiraganaMasteredRef.current) {
              hiraganaMasteredRef.current = true;
              setKanaGraduationResult("hiragana_complete");
            }
          })
          .catch(() => {
            // Non-critical -- see checkLevelUp's identical reasoning above.
          });
      }

      // Katakana just mastered too (with hiragana already mastered, a prerequisite for
      // study_katakana ever turning on) -- same reasoning as the hiragana branch above, mirrored
      // for the katakana -> standard gate (20260920_reading_test_gates_standard.sql).
      if (exerciseType === "katakana_reading" && !katakanaMasteredRef.current) {
        fetchKatakanaMastered(user.id)
          .then((masteredNow) => {
            if (masteredNow && !katakanaMasteredRef.current) {
              katakanaMasteredRef.current = true;
              setKanaGraduationResult("katakana_mastered");
            }
          })
          .catch(() => {
            // Non-critical -- see checkLevelUp's identical reasoning above.
          });
      }
    },
    [user.id]
  );

  const dismissKanaGraduation = useCallback(() => setKanaGraduationResult(null), []);

  const rate = useCallback(
    (card: DueCard, rating: Rating) => {
      // hiragana_reading/katakana_reading cards still in the post-introduction drill
      // (card.drill_mode -- server-computed, see its doc comment in lib/types/study.ts) never go
      // through the normal rating flow below -- see submitDrillAnswer. rating is repurposed as a
      // plain pass/fail signal here (>=2 matches the same "correct" threshold submit_review
      // already uses), since ReviewCardKanaReading's drill mode grades purely on typed-answer
      // correctness, with no Hard/Good/Easy picker. Reading the same server-computed flag
      // ReviewCardKanaReading uses to decide which UI to show is what guarantees the two always
      // agree -- they used to each recompute status='learning' && kana_type='seion' separately,
      // and drifted: this used to check status alone, silently rerouting a Hard/Good/Easy-rated
      // non-seion card (e.g. a still-learning yoon example) into the drill instead of
      // submit_review -- no review_logs row, no real SM-2 scheduling, stuck needing 3 "good
      // enough" answers despite the UI showing normal one-shot rating buttons the whole time.
      if (card.drill_mode) {
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
      // Marked attempted synchronously, before the submit even resolves: this card is done for
      // the session regardless of the rating (see attemptedKeysRef's declaration) -- totalKnown
      // never grows for it again, and it can't wander back into `queue` even if its resurface
      // due_at arrives while the session is still open. A failed submit undoes this below, same
      // as it undoes completedCount.
      attemptedKeysRef.current.add(reviewKey(card));

      enqueueMutation(async () => {
        try {
          const { reviewLogId } = await submitReviewApi(reviewBody(card, rating, sessionIdRef.current ?? undefined));
          lastReviewLogIdRef.current = reviewLogId;
          // A wrong answer can schedule this card to resurface later in the same session
          // (relearning steps) -- refetch so nextDueAt (and the progress-bar countdown) picks
          // that up immediately instead of waiting out the 45s poll. attemptedKeysRef (just set
          // above) keeps this same card from re-entering `queue`/totalKnown when that refetch
          // resolves -- refreshQueue only ever surfaces something else independently due.
          void refreshQueue();
          checkLevelUp(card.exercise_type);
          checkKanaGraduation(card.exercise_type);
        } catch (err) {
          setCompletedCount((c) => Math.max(0, c - 1));
          attemptedKeysRef.current.delete(reviewKey(card));
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
    [enqueueMutation, showToast, refreshQueue, submitDrillAnswer, checkLevelUp, checkKanaGraduation]
  );

  const introduceCard = useCallback(
    (
      item: QueueItem & { kind: "new_kanji" | "new_vocab" | "new_hiragana_rule" | "new_katakana_rule" },
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
  // needs to hand the user its "Hiragana reading"/"Katakana reading" pack immediately after.
  // Whether THIS tap was the one that completed the pack -- and, if so, every character id in
  // it -- is decided entirely server-side (see introduce_hiragana/introduce_katakana in
  // 20260910_persist_kana_pack_completion.sql): a freshly-introduced character stays invisible
  // to get_due_cards (pack_pending = true) until every sibling in its gojuon_row also has a
  // progress row for this user, at which point the whole pack is released atomically -- so it
  // completes correctly regardless of which session (or tab) introduced which character, unlike
  // the old client-tracked version, which lost all memory of a half-finished pack the moment the
  // page unmounted.
  //
  // Every tap is held on screen (button disabled via pendingCardKey, same as introduceKanji's own
  // single-shot hold below) until the server responds, rather than removed optimistically: with
  // several packs already queued up front (get_new_hiragana_candidates batches whichever ones fit
  // the day's remaining cap), an optimistic removal would briefly reveal the NEXT pack's own "New
  // hiragana" card the instant this tap's sibling candidates are still sitting in `queue` -- a
  // visible flash, gone the moment the reading pack actually arrives and swaps it back out. It
  // also closes the same race an earlier version of this hold used to guard narrowly (only when
  // this card was the sole item left in `queue`): removing the last card in a completely empty
  // queue fires the "queue is empty -> end session" effect before the async work below has a
  // chance to learn whether this tap just completed the pack.
  const introduceKanaCard = useCallback(
    (
      kind: "hiragana" | "katakana",
      item: QueueItem & { kind: "new_hiragana" | "new_katakana" },
      apiCall: (candidateId: number, sessionId?: number) => Promise<KanaPackResult>,
      fetchReadingCards: (ids: number[]) => Promise<DueCard[]>,
      noun: string
    ) => {
      hasProcessedAnyRef.current = true;
      setCompletedCount((c) => c + 1);
      setPendingCardKey(item.key);

      const drillPoolRef = kind === "hiragana" ? hiraganaDrillPoolRef : katakanaDrillPoolRef;
      const drillInFlightRef = kind === "hiragana" ? hiraganaInFlightRef : katakanaInFlightRef;

      enqueueMutation(async () => {
        let result: KanaPackResult;
        try {
          result = await apiCall(item.candidate.id, sessionIdRef.current ?? undefined);
        } catch (err) {
          setPendingCardKey(null);
          if (err instanceof ApiError && err.status === 409) {
            // Already introduced elsewhere -- done from the DB's point of view, so it can finally
            // leave `queue`; the next ordinary due-cards fetch will surface whatever that other
            // call actually released.
            setQueue((prev) => prev.filter((i) => i.key !== item.key));
            return;
          }
          // Never left `queue` (it was held, not optimistically removed), so there's nothing to
          // restore -- just release the hold and let the user retry the same tap.
          setCompletedCount((c) => Math.max(0, c - 1));
          showToast(err instanceof ApiError ? err.message : `Could not introduce this ${noun}. Please try again.`, "error");
          return;
        }

        if (!result.packCompleted || !result.ids) {
          setPendingCardKey(null);
          setQueue((prev) => prev.filter((i) => i.key !== item.key));
          return;
        }
        const ids = result.ids;

        // Marked in-flight for the whole fetch: these rows already exist in the DB
        // (status='learning', due) but aren't reflected in `queue` or the pool yet -- see
        // poolExtraDrillCards for why a concurrent refreshQueue poll landing in this gap needs
        // to know that.
        for (const id of ids) drillInFlightRef.current.add(id);
        const cards = await fetchReadingCards(ids).catch(() => [] as DueCard[]);
        for (const id of ids) drillInFlightRef.current.delete(id);
        setPendingCardKey(null);
        if (cards.length === 0) {
          setQueue((prev) => prev.filter((i) => i.key !== item.key));
          return;
        }

        // For a kana_type = 'seion' pack (card.drill_mode -- server-computed, always true here
        // since every freshly-introduced row starts at status='learning'), hands it straight
        // into the post-introduction drill (submitDrillAnswer): only one reading card is ever
        // shown at a time, so this shuffles the freshly-fetched pack, shows one, and stashes the
        // rest in the pool -- submitDrillAnswer draws from it (and refills it) as the user
        // answers each one, until every character has graduated. Every other kana_type
        // (dakuten/handakuten -- the only other characters that still reach this pack-based
        // flow) skips the drill entirely: the whole pack is pushed into `queue` at once, same
        // shape as introduceVocab's batch hand-off, and graded normally from the first review --
        // 20260906_selective_examples_and_seion_only_drill.sql.
        if (cards[0].drill_mode) {
          const [first, ...restPool] = shuffle(cards);
          drillPoolRef.current.push(...restPool);
          setQueue((prev) => {
            const withoutItem = prev.filter((i) => i.key !== item.key);
            if (withoutItem.some((i) => i.key === reviewKey(first))) return withoutItem;
            return [{ key: reviewKey(first), kind: "review", card: first }, ...withoutItem];
          });
        } else {
          const block = shuffle(cards).map((card) => ({ key: reviewKey(card), kind: "review" as const, card }));
          setQueue((prev) => {
            const withoutItem = prev.filter((i) => i.key !== item.key);
            const existingKeys = new Set(withoutItem.map((i) => i.key));
            const newBlock = block.filter((i) => !existingKeys.has(i.key));
            return [...newBlock, ...withoutItem];
          });
        }
      });
    },
    [enqueueMutation, showToast]
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

  // Rule cards (new_hiragana_rule/new_katakana_rule) use the plain introduceCard path, not
  // introduceKanaCard's pack/drill hand-off above -- there's no gojuon pack to complete and no
  // follow-up reading card, introduce_hiragana_rule/introduce_katakana_rule just mark the rule
  // permanently seen (20260904_kana_rule_cards.sql), so a simple optimistic removal is enough.
  const introduceHiraganaRule = useCallback(
    (item: QueueItem & { kind: "new_hiragana_rule" }) => introduceCard(item, introduceHiraganaRuleApi, "hiragana rule"),
    [introduceCard]
  );

  const introduceKatakanaRule = useCallback(
    (item: QueueItem & { kind: "new_katakana_rule" }) => introduceCard(item, introduceKatakanaRuleApi, "katakana rule"),
    [introduceCard]
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
    // Whether nextDueAt is actually worth announcing -- see next_due_status's declaration
    // above. A learning/relearning row is an SRS retry from something already attempted this
    // session (attemptedKeysRef keeps it from ever raising totalKnown again), so a countdown for
    // it would just be noise; a review row is an independent, long-scheduled card becoming due
    // on its own, which totalKnown has no other way to announce in advance -- see
    // QueueProgressBar.
    nextDueStatus,
    clockOffsetMs,
    lastReview,
    levelUpResult,
    kanaGraduationResult,
    actionPending: undoPending,
    // True when `current` is a held card awaiting a result -- a new_hiragana/new_katakana or
    // new_kanji tap, or a drill card answered when the pool was empty (submitDrillAnswer). The
    // page disables that card's button with this so the same tap can't fire twice while the
    // result is in flight.
    cardPending: pendingCardKey !== null && queue[0]?.key === pendingCardKey,
    undoDisabled,
    actions: {
      rate,
      introduceKanji,
      introduceVocab,
      introduceHiragana,
      introduceKatakana,
      introduceHiraganaRule,
      introduceKatakanaRule,
      undoLast,
      dismissLevelUp,
      dismissKanaGraduation,
    },
  };
}
