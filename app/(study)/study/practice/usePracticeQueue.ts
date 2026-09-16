"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getPracticeDeck } from "@/lib/client-data/practiceDeck";
import { recordPracticeAnswer } from "@/lib/data/practiceLog";
import {
  clearPracticeQueueCache,
  readPracticeQueueCache,
  writePracticeQueueCache,
  type CachedPracticeQueue,
  type PracticeCardKind,
  type PracticeWrongCardRef,
} from "@/lib/study/practiceQueueCache";
import {
  clearPracticeSummaryCache,
  readPracticeSummaryCache,
  writePracticeSummaryCache,
  type CachedPracticeSummary,
} from "@/lib/study/practiceSummaryCache";
import { readPracticeCategoriesCache, writePracticeCategoriesCache } from "@/lib/study/practiceCategoriesCache";
import { availablePracticeCategories, type PracticeCategory } from "@/lib/study/practiceCategories";
import { practiceCardKey, type PracticeMissedCard, type PracticePoolCard } from "@/lib/study/practicePool";
import { useStudyOnboarding } from "@/lib/study/StudyOnboardingContext";
import type { ExerciseType } from "@/lib/srs/constants";
import type { DueCard, Rating, RatingPreviews } from "@/lib/types";

export type PracticeStatus = "setup" | "loading" | "ready" | "done" | "empty" | "error";

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
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
  deck: PracticePoolCard[],
  cached: CachedPracticeQueue | null
): { queue: PracticePoolCard[]; index: number; correct: number; wrong: PracticeWrongCardRef[]; activeMs: number } {
  if (!cached) return { queue: shuffle(deck), index: 0, correct: 0, wrong: [], activeMs: 0 };

  const deckByKey = new Map(deck.map((item) => [practiceCardKey(item), item]));
  const cachedKeys = new Set(cached.order.map(practiceCardKey));

  let survivedBeforeIndex = 0;
  const survivors: PracticePoolCard[] = [];
  cached.order.forEach((ref, i) => {
    const item = deckByKey.get(practiceCardKey(ref));
    if (!item) return;
    survivors.push(item);
    if (i < cached.index) survivedBeforeIndex++;
  });

  const newItems = deck.filter((item) => !cachedKeys.has(practiceCardKey(item)));

  if (survivedBeforeIndex >= survivors.length && newItems.length === 0) {
    // Fully consumed already, and nothing new since -- start a fresh pass rather than
    // reopening a finished queue.
    return { queue: shuffle(deck), index: 0, correct: 0, wrong: [], activeMs: 0 };
  }

  return {
    queue: [...survivors, ...shuffle(newItems)],
    index: survivedBeforeIndex,
    correct: cached.correct,
    wrong: cached.wrong ?? [],
    activeMs: cached.activeMs ?? 0,
  };
}

const EMPTY_RATING_PREVIEWS: RatingPreviews = { again: "", hard: "", good: "", easy: "" };

/** The DueCard fields no practice pool card ever populates -- spread first so each branch below
 * only needs to override what its own kind actually has. */
const NULL_DUE_CARD_FIELDS = {
  kanji_id: null,
  word_id: null,
  kanji_word_id: null,
  hiragana_id: null,
  katakana_id: null,
  kanji_char: null,
  kanji_meanings: null,
  word: null,
  kana_reading: null,
  romaji_reading: null,
  other_readings: null,
  furiganas: null,
  primary_word_meanings: null,
  all_primary_word_meanings: null,
  all_word_readings: null,
  known_kanji_chars: null,
  kana_character: null,
  kana_romaji: null,
  kana_type: null,
  drill_streak: null,
} as const;

/** Every practice card, regardless of kind, is shown in "drill" presentation (correct/incorrect
 * + Continue, no Hard/Good/Easy grid -- see ReviewCardKanaReading/ReviewCardKanjiMeaning/
 * ReviewCardKanjiReading/ReviewCardVocabMeaning's own drill_mode handling) and never touches SRS
 * state: rate() below only updates the in-memory score and advances to the next card, so nothing
 * here can ever affect due dates or mastery. It does log to practice_logs for streak/XP credit
 * (see rate()'s own comment) -- that table has no relationship to any user_*_progress row, so
 * this guarantee still holds. */
function toDueCard(item: PracticePoolCard): DueCard {
  const shared = {
    progress_id: item.id,
    ...NULL_DUE_CARD_FIELDS,
    drill_mode: true,
    rating_previews: EMPTY_RATING_PREVIEWS,
    status: "review" as const,
    is_bonus: false,
  };

  switch (item.kind) {
    case "hiragana":
    case "katakana":
      return {
        ...shared,
        exercise_type: item.kind === "hiragana" ? "hiragana_reading" : "katakana_reading",
        hiragana_id: item.kind === "hiragana" ? item.id : null,
        katakana_id: item.kind === "katakana" ? item.id : null,
        kana_character: item.character,
        kana_romaji: item.romaji,
        is_bonus: item.bonus,
      };
    case "kanji_meaning":
      return {
        ...shared,
        exercise_type: "kanji_meaning",
        kanji_id: item.id,
        kanji_char: item.kanjiChar,
        kanji_meanings: item.meanings,
      };
    case "kanji_reading":
      return {
        ...shared,
        exercise_type: "kanji_reading",
        kanji_id: item.kanjiId,
        kanji_word_id: item.id,
        kanji_char: item.kanjiChar,
        kanji_meanings: item.kanjiMeanings,
        word: item.word,
        kana_reading: item.kanaReading,
        romaji_reading: item.romajiReading,
        other_readings: item.otherReadings,
        furiganas: item.furiganas,
        primary_word_meanings: item.primaryWordMeanings,
      };
    case "vocab_meaning":
      return {
        ...shared,
        exercise_type: "vocab_meaning",
        word_id: item.id,
        word: item.word,
        kana_reading: item.kanaReading,
        furiganas: item.furiganas,
        primary_word_meanings: item.primaryMeanings,
        all_primary_word_meanings: item.allPrimaryMeanings,
      };
  }
}

function kindForExerciseType(exerciseType: ExerciseType): PracticeCardKind {
  switch (exerciseType) {
    case "hiragana_reading":
      return "hiragana";
    case "katakana_reading":
      return "katakana";
    case "kanji_meaning":
    case "kanji_reading":
    case "vocab_meaning":
      return exerciseType;
  }
}

export interface PracticeQueueState {
  status: PracticeStatus;
  error: string | null;
  current: { key: string; card: DueCard } | null;
  correct: number;
  completed: number;
  total: number;
  /** Cards rated incorrect so far this pass, in the order they were answered -- shown as a list
   * on the "done" summary once the deck runs out. */
  wrongAnswers: PracticeMissedCard[];
  /** Screen-on milliseconds spent on this pass so far (see the timer effect below) -- frozen once
   * `status` reaches "done", so the summary shows a stable total. */
  activeMs: number;
  /** The 4 category options this user's study_track actually has content for -- kanji/vocabulary
   * are omitted entirely on the kana track (see availablePracticeCategories). */
  availableCategories: readonly PracticeCategory[];
  /** What the setup screen should preselect: this user's last actually-started selection, or
   * none, the first time they ever visit. */
  initialCategories: readonly PracticeCategory[];
  actions: {
    rate: (card: DueCard, rating: Rating) => void;
    /** Starts a fresh pass through just the cards missed this pass -- see retryMistakes below. */
    retryMistakes: () => void;
    /** Fetches and shuffles a fresh deck for exactly these categories -- called once from the
     * setup screen's Start button. */
    startPractice: (categories: PracticeCategory[]) => void;
    /** Drops the current/finished pass and returns to the setup screen (still preselecting the
     * same categories, since they're now the remembered choice) -- see PracticeQueueState.status
     * === "setup". */
    goToSetup: () => void;
  };
}

/** Drives /study/practice: a single shuffled pass through every hiragana_reading/
 * katakana_reading/kanji_meaning/kanji_reading/vocab_meaning card the user has ever been
 * introduced to (see getPracticeDeck), restricted to whichever categories they picked on the
 * setup screen. Deliberately has no concept of a session or SRS rating: rate() only updates the
 * in-memory score, fires a best-effort practice_logs insert for streak/XP credit, and advances to
 * the next card -- nothing here can ever affect due dates, mastery, or achievement stats. Each
 * character is shown exactly once -- reaching the end of the deck flips `status` to "done" so the
 * page can show a summary instead of looping again.
 *
 * Two independent localStorage caches carry state across a refresh, same-browser only:
 * practiceQueueCache mirrors an in-progress pass (order/position/score/activeMs) so leaving
 * mid-deck resumes instead of reshuffling -- reconcileQueue folds in any newly-learned cards on
 * read. practiceSummaryCache mirrors a *finished* pass's result indefinitely (see its own doc
 * comment) so a refresh, or just reopening the page later, shows the exact same "done" summary
 * instead of silently starting over -- restoredSummary below short-circuits everything else the
 * moment one is found, and is only ever cleared by retryMistakes/startPractice-via-goToSetup.
 *
 * Also tracks screen-on time spent actually working through the deck (activeMs): a segment runs
 * while `effectiveStatus` is "ready" and the tab is visible, and is committed (added to the
 * running total) whenever either stops being true -- tab hidden/backgrounded, or the deck
 * reaching "done" -- so time spent with the screen off or after finishing never counts. Like
 * correct/wrong, it's mirrored to the cache so a refresh mid-pass keeps the running total. */
export function usePracticeQueue(): PracticeQueueState {
  const { user, settings } = useStudyOnboarding();
  const availableCategories = useMemo(() => availablePracticeCategories(settings.study_track), [settings.study_track]);
  // Deliberately NOT memoized: startPractice re-writes this cache every time the user actually
  // starts a pass, and the setup screen needs each fresh mount (e.g. after goToSetup) to
  // preselect that latest choice rather than whatever was remembered the first time this hook
  // ever rendered. The read itself is a cheap synchronous localStorage hit either way.
  const remembered = readPracticeCategoriesCache(user.id)?.filter((c) => availableCategories.includes(c));
  const initialCategories = remembered && remembered.length > 0 ? remembered : [];

  // Reading the two localStorage caches is synchronous, so the very first render already knows
  // whether to show a restored "done" summary, resume a mid-deck pass, or land on "setup" --
  // computed once via useState's lazy initializer (not an effect: setting state synchronously
  // from an effect body just to seed initial state trips react-hooks/set-state-in-effect and
  // causes an avoidable extra render). Only the resumed pass's actual deck fetch -- a real
  // asynchronous operation -- happens in an effect below.
  const [initial] = useState(() => {
    const cachedSummary = readPracticeSummaryCache(user.id);
    if (cachedSummary) return { status: "done" as const, restoredSummary: cachedSummary, resumeQueue: null };
    const cachedQueue = readPracticeQueueCache(user.id);
    if (cachedQueue) return { status: "loading" as const, restoredSummary: null, resumeQueue: cachedQueue };
    return { status: "setup" as const, restoredSummary: null, resumeQueue: null };
  });

  const [status, setStatus] = useState<PracticeStatus>(initial.status);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<PracticePoolCard[]>([]);
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrongRefs, setWrongRefs] = useState<PracticeWrongCardRef[]>([]);
  const [activeMs, setActiveMs] = useState(0);
  // True once retryMistakes has swapped the queue down to just the missed cards -- gates the
  // mid-deck cache-mirror effect below, since that smaller queue must never be persisted as if
  // it were the real deck (see that effect's own comment).
  const [isRetrying, setIsRetrying] = useState(false);
  // Set from the initial cache read above, or produced when a live pass reaches "done" -- once
  // set, it alone drives the "done" render; see effectiveStatus/wrongAnswers.
  const [restoredSummary, setRestoredSummary] = useState<CachedPracticeSummary | null>(initial.restoredSummary);

  // The categories the current/most-recently-finished pass actually used -- distinct from
  // initialCategories (the setup screen's preselection), and read by the cache-mirror effects so
  // a resumed/finished pass's cache entry always reflects what was really fetched.
  const categoriesUsedRef = useRef<PracticeCategory[]>(initial.restoredSummary?.categories ?? initial.resumeQueue?.categories ?? []);

  // Source of truth for accumulated active time; `activeMs` state mirrors it after each commit,
  // purely so it can be rendered and written to the cache (see the timer effect below).
  const activeMsRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);

  // Cancels whichever loadDeck call is currently in flight, if any -- startPractice/goToSetup
  // can fire a new one before an earlier one resolves (e.g. Start pressed twice in a row), and
  // without this the stale response could still land and clobber the newer one's state.
  const cancelPendingLoadRef = useRef<(() => void) | null>(null);

  // Doesn't itself set status to "loading" -- callers do that (see startPractice, and the mount
  // effect's `initial.status` lazy default) so this stays free of a synchronous setState call in
  // its own body, which would otherwise trip react-hooks/set-state-in-effect the moment the
  // mount effect below calls it directly.
  const loadDeck = useCallback(
    (categories: PracticeCategory[], cachedQueue: CachedPracticeQueue | null) => {
      cancelPendingLoadRef.current?.();
      categoriesUsedRef.current = categories;
      let cancelled = false;
      cancelPendingLoadRef.current = () => {
        cancelled = true;
      };
      getPracticeDeck(user.id, categories, settings.enabled_levels)
        .then((deck) => {
          if (cancelled) return;
          if (deck.length === 0) {
            setStatus("empty");
            return;
          }
          const {
            queue: resolvedQueue,
            index: resolvedIndex,
            correct: resolvedCorrect,
            wrong: resolvedWrong,
            activeMs: resolvedActiveMs,
          } = reconcileQueue(deck, cachedQueue);
          setQueue(resolvedQueue);
          setIndex(resolvedIndex);
          setCorrect(resolvedCorrect);
          setWrongRefs(resolvedWrong);
          activeMsRef.current = resolvedActiveMs;
          setActiveMs(resolvedActiveMs);
          setIsRetrying(false);
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
    },
    [user.id, settings.enabled_levels]
  );

  useEffect(() => {
    if (!initial.resumeQueue) return;
    return loadDeck(initial.resumeQueue.categories, initial.resumeQueue);
    // Only ever meant to run once, on mount, to resume the pass `initial` already found cached --
    // startPractice/goToSetup own every transition after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Purely a derived view for callers -- `status` itself stays "ready" internally, queue/index
  // are the real source of truth for whether the deck is finished (unless a finished pass was
  // restored straight from cache, which short-circuits this entirely).
  const effectiveStatus: PracticeStatus = restoredSummary
    ? "done"
    : status === "ready" && queue.length > 0 && index >= queue.length
      ? "done"
      : status;

  // Runs one active-time "segment" for as long as effectiveStatus is "ready" and the tab is
  // visible, committing it into activeMsRef/activeMs the moment either stops holding: the tab
  // is hidden/backgrounded (screen off, app switched away), the deck reaches "done", or this
  // component unmounts (the user navigated off the route). Each is exactly the pause this was
  // asked to exclude.
  useEffect(() => {
    function commitSegment() {
      if (segmentStartRef.current === null) return;
      activeMsRef.current += Date.now() - segmentStartRef.current;
      segmentStartRef.current = null;
      setActiveMs(activeMsRef.current);
    }

    if (effectiveStatus !== "ready") {
      commitSegment();
      return;
    }

    function handleVisibilityChange() {
      if (document.hidden) commitSegment();
      else segmentStartRef.current = Date.now();
    }

    segmentStartRef.current = Date.now();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      commitSegment();
    };
  }, [effectiveStatus]);

  const currentItem = index < queue.length ? queue[index] : null;
  const current = currentItem ? { key: practiceCardKey(currentItem), card: toDueCard(currentItem) } : null;
  const liveWrongAnswers = useMemo(
    () =>
      wrongRefs
        .map((ref) => {
          const item = queue.find((card) => card.id === ref.id && card.kind === ref.kind);
          return item ? { ...item, userAnswer: ref.userAnswer ?? "" } : null;
        })
        .filter((item): item is PracticeMissedCard => item !== null),
    [wrongRefs, queue]
  );

  // Mirrors queue/index/correct/wrong/activeMs to localStorage after every render they change in
  // (including the very first one -- re-writing back what reconcileQueue just resolved is
  // harmless), and -- once the deck is fully consumed -- persists the finished result
  // indefinitely instead (see practiceSummaryCache's own doc comment) and drops the now-useless
  // mid-deck resume cache. Skipped entirely while a finished pass was restored straight from
  // cache: there's no live pass here to mirror.
  useEffect(() => {
    if (restoredSummary) return;
    if (status !== "ready" || queue.length === 0) return;

    if (index >= queue.length) {
      writePracticeSummaryCache(user.id, {
        categories: categoriesUsedRef.current,
        correct,
        total: queue.length,
        wrongAnswers: liveWrongAnswers,
        activeMs,
      });
      clearPracticeQueueCache(user.id);
      return;
    }

    // A mistakes-only retry queue is a subset of the real deck -- persisting it here would make
    // the next refresh's reconcileQueue treat every other deck card as newly-learned and append
    // it right back in.
    if (isRetrying) return;

    writePracticeQueueCache(user.id, {
      categories: categoriesUsedRef.current,
      order: queue.map((item) => ({ kind: item.kind, id: item.id })),
      index,
      correct,
      wrong: wrongRefs,
      activeMs,
    });
  }, [status, queue, index, correct, wrongRefs, activeMs, isRetrying, user.id, restoredSummary, liveWrongAnswers]);

  const rate = useCallback(
    (card: DueCard, rating: Rating, userAnswer?: string) => {
      const isCorrect = rating >= 2;
      if (isCorrect) {
        setCorrect((c) => c + 1);
      } else {
        setWrongRefs((refs) => [...refs, { kind: kindForExerciseType(card.exercise_type), id: card.progress_id, userAnswer: userAnswer ?? "" }]);
      }
      setIndex((i) => i + 1);

      // Fire-and-forget: this only ever earns streak/XP credit (see practice_logs' own trigger),
      // never anything the queue itself depends on, so a failure here must never block or roll
      // back the local advance above.
      void recordPracticeAnswer(createClient(), user.id, {
        exerciseType: card.exercise_type,
        correct: isCorrect,
        kanjiId: card.kanji_id,
        wordId: card.word_id,
        hiraganaId: card.hiragana_id,
        katakanaId: card.katakana_id,
      }).catch((err) => {
        console.error("Failed to record practice answer for streak/XP credit", err);
      });
    },
    [user.id]
  );

  // Starts a brand-new pass through just the cards missed this time -- a fresh shuffle, score,
  // and timer, exactly like starting the deck fresh but scoped to the missed cards. Only ever
  // called from the "done" summary, so there's no in-flight rate() call it could race with.
  const retryMistakes = useCallback(() => {
    const missed = restoredSummary ? restoredSummary.wrongAnswers : liveWrongAnswers;
    if (missed.length === 0) return;
    categoriesUsedRef.current = restoredSummary ? restoredSummary.categories : categoriesUsedRef.current;
    clearPracticeSummaryCache(user.id);
    setRestoredSummary(null);
    setIsRetrying(true);
    setQueue(shuffle(missed));
    setIndex(0);
    setCorrect(0);
    setWrongRefs([]);
    activeMsRef.current = 0;
    setActiveMs(0);
    setStatus("ready");
  }, [restoredSummary, liveWrongAnswers, user.id]);

  const startPractice = useCallback(
    (categories: PracticeCategory[]) => {
      writePracticeCategoriesCache(user.id, categories);
      clearPracticeSummaryCache(user.id);
      setRestoredSummary(null);
      setStatus("loading");
      loadDeck(categories, null);
    },
    [user.id, loadDeck]
  );

  const goToSetup = useCallback(() => {
    clearPracticeSummaryCache(user.id);
    clearPracticeQueueCache(user.id);
    setRestoredSummary(null);
    setQueue([]);
    setIndex(0);
    setCorrect(0);
    setWrongRefs([]);
    activeMsRef.current = 0;
    setActiveMs(0);
    setIsRetrying(false);
    setStatus("setup");
  }, [user.id]);

  const wrongAnswers = restoredSummary ? restoredSummary.wrongAnswers : liveWrongAnswers;

  return {
    status: effectiveStatus,
    error,
    current,
    correct: restoredSummary ? restoredSummary.correct : correct,
    completed: restoredSummary ? restoredSummary.total : Math.min(index, queue.length),
    total: restoredSummary ? restoredSummary.total : queue.length,
    wrongAnswers,
    activeMs: restoredSummary ? restoredSummary.activeMs : activeMs,
    availableCategories,
    initialCategories,
    actions: { rate, retryMistakes, startPractice, goToSetup },
  };
}
