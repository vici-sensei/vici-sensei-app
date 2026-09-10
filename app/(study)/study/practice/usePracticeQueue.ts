"use client";

import { useCallback, useEffect, useState } from "react";
import { getPracticeDeck, type PracticeKanaCard } from "@/lib/client-data/kanaPractice";
import {
  clearPracticeQueueCache,
  readPracticeQueueCache,
  writePracticeQueueCache,
  type CachedPracticeQueue,
} from "@/lib/study/practiceQueueCache";
import { useStudyOnboarding } from "@/lib/study/StudyOnboardingContext";
import type { DueCard, Rating } from "@/lib/types";

export type PracticeStatus = "loading" | "ready" | "done" | "empty" | "error";

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function cardKey(item: { id: number; script: "hiragana" | "katakana" }): string {
  return `${item.script}-${item.id}`;
}

/** Merges a freshly-fetched deck with the last cached queue for this user (if any): cards no
 * longer in the deck (e.g. suspended since) are dropped, and any card in the deck that wasn't
 * anywhere in the cached queue -- newly learned since the cache was written, or a bonus
 * character that just unlocked (see getPracticeDeck) -- is shuffled and appended after the
 * existing order, so a resumed session simply runs longer instead of reshuffling what's already
 * in progress. Never touches per-card retry state (there isn't any here, see usePracticeQueue's
 * own doc comment) -- it only decides deck membership and order. Falls back to a fresh shuffle
 * when there's no cache, or when the cached queue was already fully consumed and nothing new was
 * learned/unlocked since. */
function reconcileQueue(
  deck: PracticeKanaCard[],
  cached: CachedPracticeQueue | null
): { queue: PracticeKanaCard[]; index: number; correct: number } {
  if (!cached) return { queue: shuffle(deck), index: 0, correct: 0 };

  const deckByKey = new Map(deck.map((item) => [cardKey(item), item]));
  const cachedKeys = new Set(cached.order.map(cardKey));

  let survivedBeforeIndex = 0;
  const survivors: PracticeKanaCard[] = [];
  cached.order.forEach((ref, i) => {
    const item = deckByKey.get(cardKey(ref));
    if (!item) return;
    survivors.push(item);
    if (i < cached.index) survivedBeforeIndex++;
  });

  const newItems = deck.filter((item) => !cachedKeys.has(cardKey(item)));

  if (survivedBeforeIndex >= survivors.length && newItems.length === 0) {
    // Fully consumed already, and nothing new since -- start a fresh pass rather than
    // reopening a finished queue.
    return { queue: shuffle(deck), index: 0, correct: 0 };
  }

  return { queue: [...survivors, ...shuffle(newItems)], index: survivedBeforeIndex, correct: cached.correct };
}

function toDueCard(item: PracticeKanaCard): DueCard {
  return {
    exercise_type: item.script === "hiragana" ? "hiragana_reading" : "katakana_reading",
    progress_id: item.id,
    kanji_id: null,
    word_id: null,
    kanji_word_id: null,
    hiragana_id: item.script === "hiragana" ? item.id : null,
    katakana_id: item.script === "katakana" ? item.id : null,
    kanji_char: null,
    kanji_meanings: null,
    word: null,
    kana_reading: null,
    romaji_reading: null,
    other_readings: null,
    furiganas: null,
    word_meanings: null,
    all_word_meanings: null,
    all_word_readings: null,
    known_kanji_chars: null,
    kana_character: item.character,
    kana_romaji: item.romaji,
    kana_type: null,
    drill_streak: null,
    // Forces ReviewCardKanaReading into its no-Hard/Good/Easy "drill" presentation (correct/
    // incorrect + Continue only) -- there's no SRS state here for a rating to act on, so the
    // rating grid (which implies scheduling a review interval) would be meaningless.
    // rating_previews is never rendered in this mode; it only exists to satisfy DueCard's shape.
    drill_mode: true,
    rating_previews: { again: "", hard: "", good: "", easy: "" },
    status: "review",
    is_bonus: item.bonus,
  };
}

export interface PracticeQueueState {
  status: PracticeStatus;
  error: string | null;
  current: { key: string; card: DueCard } | null;
  correct: number;
  completed: number;
  total: number;
  actions: {
    rate: (card: DueCard, rating: Rating) => void;
  };
}

/** Drives /study/practice: a single shuffled pass through every hiragana_reading/
 * katakana_reading character the user has ever been introduced to (see fetchSeenHiragana/
 * fetchSeenKatakana), plus -- once a script is fully mastered -- its study_enabled = false bonus
 * characters (see getPracticeDeck), marked via DueCard.is_bonus so ReviewCardKanaReading can
 * flag them. Fetched once, then never touches the network again. Deliberately has no concept of
 * a session, SRS rating, or review log: rate() only updates the in-memory score and advances to
 * the next card, so nothing here can ever affect due dates, mastery, streaks, or
 * leaderboard/achievement stats. Each character is shown exactly once -- reaching the end of the
 * deck flips `status` to "done" so the page can show a summary instead of looping again.
 *
 * Queue order/position/score are mirrored to localStorage (see practiceQueueCache) so a refresh
 * or reopening the tab resumes instead of reshuffling -- same-browser only, this never syncs
 * across devices. reconcileQueue folds in any newly-learned characters on read. */
export function usePracticeQueue(): PracticeQueueState {
  const { user } = useStudyOnboarding();
  const [status, setStatus] = useState<PracticeStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<PracticeKanaCard[]>([]);
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPracticeDeck(user.id)
      .then((deck) => {
        if (cancelled) return;
        if (deck.length === 0) {
          setStatus("empty");
          return;
        }
        const { queue: resolvedQueue, index: resolvedIndex, correct: resolvedCorrect } = reconcileQueue(
          deck,
          readPracticeQueueCache(user.id)
        );
        setQueue(resolvedQueue);
        setIndex(resolvedIndex);
        setCorrect(resolvedCorrect);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load your practice deck.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  // Mirrors queue/index/correct to localStorage after every render they change in, including
  // the very first one (re-writing back what reconcileQueue just resolved is harmless). Clears
  // the cache once the deck is fully consumed so the next visit starts a fresh pass rather than
  // reopening a finished one.
  useEffect(() => {
    if (status !== "ready" || queue.length === 0) return;
    if (index >= queue.length) {
      clearPracticeQueueCache(user.id);
      return;
    }
    writePracticeQueueCache(user.id, {
      order: queue.map((item) => ({ id: item.id, script: item.script })),
      index,
      correct,
    });
  }, [status, queue, index, correct, user.id]);

  const rate = useCallback((_card: DueCard, rating: Rating) => {
    if (rating >= 2) setCorrect((c) => c + 1);
    setIndex((i) => i + 1);
  }, []);

  const currentItem = index < queue.length ? queue[index] : null;
  const current = currentItem ? { key: `${currentItem.script}-${currentItem.id}`, card: toDueCard(currentItem) } : null;
  // Purely a derived view for callers -- `status` itself stays "ready" internally, queue/index
  // are the real source of truth for whether the deck is finished.
  const effectiveStatus: PracticeStatus = status === "ready" && queue.length > 0 && index >= queue.length ? "done" : status;

  return {
    status: effectiveStatus,
    error,
    current,
    correct,
    completed: Math.min(index, queue.length),
    total: queue.length,
    actions: { rate },
  };
}
