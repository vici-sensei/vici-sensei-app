"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { useToast } from "@/app/components/ui/Toast";
import { clearStoredSessionId, getStoredSessionId, setStoredSessionId } from "@/lib/study/session";
import type { DueCard, Rating, ReviewResult, StudyQueueResponse, StudySessionStart } from "@/lib/types";
import { newKanjiKey, newVocabKey, reviewKey, type QueueItem } from "./types";

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
  return items;
}

function reviewBody(card: DueCard, rating: Rating) {
  const body: Record<string, unknown> = { exercise_type: card.exercise_type, rating };
  if (card.exercise_type === "kanji_meaning") body.kanji_id = card.kanji_id;
  else if (card.exercise_type === "kanji_reading") body.kanji_word_id = card.kanji_word_id;
  else body.word_id = card.word_id;
  return body;
}

export function useStudyQueue() {
  const router = useRouter();
  const { showToast } = useToast();
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [nextDueAt, setNextDueAt] = useState<string | null>(null);
  const [lastReview, setLastReview] = useState<LastReview | null>(null);
  const [undoPending, setUndoPending] = useState(false);

  const sessionIdRef = useRef<number | null>(null);
  const endingRef = useRef(false);
  const hasProcessedAnyRef = useRef(false);
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
          await apiPost("/api/study/session/end", { session_id: sessionId });
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

  const maybeEnd = useCallback(
    (nextQueue: QueueItem[]) => {
      if (nextQueue.length === 0 && !endingRef.current) {
        void endSession(hasProcessedAnyRef.current);
      }
    },
    [endSession]
  );

  const refreshQueue = useCallback(async () => {
    try {
      const data = await apiGet<StudyQueueResponse>("/api/study/queue");
      const incoming = buildQueue(data);
      setNextDueAt(data.next_due_at);
      setQueue((prev) => {
        const existingKeys = new Set(prev.map((i) => i.key));
        const additions = incoming.filter((i) => !existingKeys.has(i.key));
        const next = [...prev, ...additions];
        maybeEnd(next);
        return next;
      });
    } catch {
      // periodic refresh failures shouldn't interrupt an active session
    }
  }, [maybeEnd]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const storedSessionId = getStoredSessionId();
        // Neither of these depends on the other's result, so they fire together instead
        // of the queue fetch waiting on session/start to finish first.
        const [started, data] = await Promise.all([
          storedSessionId == null ? apiPost<StudySessionStart>("/api/study/session/start") : Promise.resolve(null),
          apiGet<StudyQueueResponse>("/api/study/queue"),
        ]);
        const sessionId = storedSessionId ?? started!.session_id;
        if (started) setStoredSessionId(sessionId);
        sessionIdRef.current = sessionId;

        if (cancelled) return;
        const items = buildQueue(data);
        setQueue(items);
        setNextDueAt(data.next_due_at);

        if (items.length === 0) {
          void endSession(false);
          return;
        }

        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
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
  // waiting out the rest of the REFRESH_INTERVAL_MS poll.
  useEffect(() => {
    if (status !== "ready" || !nextDueAt) return;
    const delay = new Date(nextDueAt).getTime() - Date.now();
    if (delay <= 0) {
      void refreshQueue();
      return;
    }
    const timeout = setTimeout(() => void refreshQueue(), delay);
    return () => clearTimeout(timeout);
  }, [status, nextDueAt, refreshQueue]);

  const enqueueMutation = useCallback((mutate: () => Promise<void>) => {
    mutationChainRef.current = mutationChainRef.current.then(mutate, mutate);
  }, []);

  const rate = useCallback(
    (card: DueCard, rating: Rating) => {
      hasProcessedAnyRef.current = true;
      setLastReview({ card });
      setCompletedCount((c) => c + 1);
      setQueue((prev) => {
        const next = prev.filter((i) => i.key !== reviewKey(card));
        maybeEnd(next);
        return next;
      });

      enqueueMutation(async () => {
        try {
          await apiPost<ReviewResult>("/api/study/review", reviewBody(card, rating));
        } catch (err) {
          setCompletedCount((c) => Math.max(0, c - 1));
          setLastReview((prev) => (prev?.card === card ? null : prev));
          setQueue((prev) => [{ key: reviewKey(card), kind: "review", card }, ...prev]);
          showToast(err instanceof ApiError ? err.message : "Could not submit your answer. Please try again.", "error");
        }
      });
    },
    [enqueueMutation, maybeEnd, showToast]
  );

  const introduceKanji = useCallback(
    (item: QueueItem & { kind: "new_kanji" }) => {
      hasProcessedAnyRef.current = true;
      setCompletedCount((c) => c + 1);
      setQueue((prev) => {
        const next = prev.filter((i) => i.key !== item.key);
        maybeEnd(next);
        return next;
      });

      enqueueMutation(async () => {
        try {
          await apiPost("/api/study/kanji/introduce", {
            kanji_id: item.candidate.id,
            session_id: sessionIdRef.current,
          });
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) return; // already introduced elsewhere — not a failure
          setCompletedCount((c) => Math.max(0, c - 1));
          setQueue((prev) => [item, ...prev]);
          showToast(err instanceof ApiError ? err.message : "Could not introduce this kanji. Please try again.", "error");
        }
      });
    },
    [enqueueMutation, maybeEnd, showToast]
  );

  const introduceVocab = useCallback(
    (item: QueueItem & { kind: "new_vocab" }) => {
      hasProcessedAnyRef.current = true;
      setCompletedCount((c) => c + 1);
      setQueue((prev) => {
        const next = prev.filter((i) => i.key !== item.key);
        maybeEnd(next);
        return next;
      });

      enqueueMutation(async () => {
        try {
          await apiPost("/api/study/vocabulary/introduce", {
            word_id: item.candidate.id,
            session_id: sessionIdRef.current,
          });
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) return; // already introduced elsewhere — not a failure
          setCompletedCount((c) => Math.max(0, c - 1));
          setQueue((prev) => [item, ...prev]);
          showToast(err instanceof ApiError ? err.message : "Could not introduce this word. Please try again.", "error");
        }
      });
    },
    [enqueueMutation, maybeEnd, showToast]
  );

  const undoLast = useCallback(() => {
    if (!lastReview) return;
    const toUndo = lastReview;
    setUndoPending(true);

    // Chained behind rate()/introduceKanji()/introduceVocab() so the review being undone
    // has definitely landed on the server before the undo request fires.
    enqueueMutation(async () => {
      try {
        await apiPost("/api/study/review/undo");
        setCompletedCount((c) => Math.max(0, c - 1));
        setQueue((prev) => [{ key: reviewKey(toUndo.card), kind: "review", card: toUndo.card }, ...prev]);
        setLastReview((prev) => (prev === toUndo ? null : prev));
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : "Could not undo your last answer.", "error");
      } finally {
        setUndoPending(false);
      }
    });
  }, [enqueueMutation, lastReview, showToast]);

  return {
    status,
    error,
    current: queue[0] ?? null,
    completedCount,
    totalKnown: completedCount + queue.length,
    nextDueAt,
    lastReview,
    actionPending: undoPending,
    actions: { rate, introduceKanji, introduceVocab, undoLast },
  };
}
