"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import {
  endSession as endStudySessionApi,
  getFirstDueCard,
  getSessionProgress as getSessionProgressApi,
  getStudyQueue,
  introduceKanji as introduceKanjiApi,
  introduceVocabulary as introduceVocabularyApi,
  introduceHiragana as introduceHiraganaApi,
  introduceKatakana as introduceKatakanaApi,
  startSession as startStudySessionApi,
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
// Within each group the order is shuffled so a session doesn't always present cards in the
// same due_at/id order.
function reviewsFirst(items: QueueItem[]): QueueItem[] {
  const reviews = shuffle(items.filter((i) => i.kind === "review"));
  const newCards = shuffle(items.filter((i) => i.kind !== "review"));
  return [...reviews, ...newCards];
}

// Same priority, but leaves the card currently on screen in place so a merge never
// yanks it out from under the user mid-answer, and leaves already-queued cards in place too --
// only the newly-fetched additions get shuffled in, so the rest of the queue doesn't visibly
// reorder itself out from under the user on every poll.
function mergeKeepingCurrent(prev: QueueItem[], additions: QueueItem[]): QueueItem[] {
  if (prev.length === 0) return reviewsFirst(additions);
  const [current, ...rest] = prev;
  const restReviews = rest.filter((i) => i.kind === "review");
  const restNew = rest.filter((i) => i.kind !== "review");
  const addReviews = shuffle(additions.filter((i) => i.kind === "review"));
  const addNew = shuffle(additions.filter((i) => i.kind !== "review"));
  return [current, ...restReviews, ...addReviews, ...restNew, ...addNew];
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
  const [nextDueAt, setNextDueAt] = useState<string | null>(null);
  const [lastReview, setLastReview] = useState<LastReview | null>(null);
  const [undoPending, setUndoPending] = useState(false);
  const [undoDisabled, setUndoDisabled] = useState(false);
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
          clearStoredSessionId();
        }
      } catch {
        // nothing to recover — the session just won't be marked ended server-side
      } finally {
        router.push("/dashboard");
      }
    },
    [router]
  );

  const refreshQueue = useCallback(async () => {
    try {
      const data = await getStudyQueue(user.id, settings, (wordsByKanjiId) => {
        setQueue((prev) => patchKanjiWords(prev, wordsByKanjiId));
      });
      const incoming = buildQueue(data);
      setNextDueAt(data.next_due_at);
      setQueue((prev) => {
        const existingKeys = new Set(prev.map((i) => i.key));
        const additions = incoming.filter((i) => !existingKeys.has(i.key));
        return mergeKeepingCurrent(prev, additions);
      });
    } catch {
      // periodic refresh failures shouldn't interrupt an active session
    }
  }, [user.id, settings]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const storedSessionId = getStoredSessionId();
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
            setStoredSessionId(started.session_id);
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

        if (settled) {
          setQueue((prev) => {
            const existingKeys = new Set(prev.map((i) => i.key));
            const additions = items.filter((i) => !existingKeys.has(i.key));
            return mergeKeepingCurrent(prev, additions);
          });
          return;
        }

        settled = true;
        setQueue(items);
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

  const rate = useCallback(
    (card: DueCard, rating: Rating) => {
      hasProcessedAnyRef.current = true;
      // Invalidated until the submit below actually confirms an id -- guards Undo against
      // firing on a stale id from an earlier review while this one is still in flight.
      lastReviewLogIdRef.current = null;
      setLastReview({ card });
      setCompletedCount((c) => c + 1);
      setQueue((prev) => prev.filter((i) => i.key !== reviewKey(card)));

      enqueueMutation(async () => {
        try {
          const { reviewLogId } = await submitReviewApi(reviewBody(card, rating, sessionIdRef.current ?? undefined));
          lastReviewLogIdRef.current = reviewLogId;
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
    [enqueueMutation, showToast, refreshQueue]
  );

  const introduceCard = useCallback(
    (
      item: QueueItem & { kind: "new_kanji" | "new_vocab" | "new_hiragana" | "new_katakana" },
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

  const introduceKanji = useCallback(
    (item: QueueItem & { kind: "new_kanji" }) => introduceCard(item, introduceKanjiApi, "kanji"),
    [introduceCard]
  );

  const introduceVocab = useCallback(
    (item: QueueItem & { kind: "new_vocab" }) => introduceCard(item, introduceVocabularyApi, "word"),
    [introduceCard]
  );

  const introduceHiragana = useCallback(
    (item: QueueItem & { kind: "new_hiragana" }) => introduceCard(item, introduceHiraganaApi, "hiragana character"),
    [introduceCard]
  );

  const introduceKatakana = useCallback(
    (item: QueueItem & { kind: "new_katakana" }) => introduceCard(item, introduceKatakanaApi, "katakana character"),
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
    totalKnown: completedCount + queue.length,
    nextDueAt,
    clockOffsetMs,
    lastReview,
    actionPending: undoPending,
    undoDisabled,
    actions: { rate, introduceKanji, introduceVocab, introduceHiragana, introduceKatakana, undoLast },
  };
}
