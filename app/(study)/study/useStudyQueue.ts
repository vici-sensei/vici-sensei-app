"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { useToast } from "@/app/components/ui/Toast";
import { clearStoredSessionId, getStoredSessionId, setStoredSessionId, setStoredSummary } from "@/lib/study/session";
import type {
  DueCard,
  KanjiDetail,
  Rating,
  ReviewResult,
  StudyQueueResponse,
  StudySessionEnd,
  StudySessionStart,
} from "@/lib/types";
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
  const [lastReview, setLastReview] = useState<LastReview | null>(null);
  const [kanjiDetails, setKanjiDetails] = useState<Record<number, KanjiDetail | "loading" | "error">>({});
  const [actionPending, setActionPending] = useState(false);

  const sessionIdRef = useRef<number | null>(null);
  const endingRef = useRef(false);
  const hasProcessedAnyRef = useRef(false);

  const prefetchKanji = useCallback((items: QueueItem[]) => {
    const kanjiItems = items.filter((i): i is QueueItem & { kind: "new_kanji" } => i.kind === "new_kanji");
    for (const item of kanjiItems) {
      setKanjiDetails((prev) => (prev[item.candidate.id] !== undefined ? prev : { ...prev, [item.candidate.id]: "loading" }));
      apiGet<KanjiDetail>(`/api/kanji/${item.candidate.id}`)
        .then((detail) => setKanjiDetails((prev) => ({ ...prev, [item.candidate.id]: detail })))
        .catch(() => setKanjiDetails((prev) => ({ ...prev, [item.candidate.id]: "error" })));
    }
  }, []);

  const endSession = useCallback(
    async (hasProgress: boolean) => {
      if (endingRef.current) return;
      endingRef.current = true;
      setStatus("ending");
      const sessionId = sessionIdRef.current;
      try {
        if (sessionId != null) {
          const summary = await apiPost<StudySessionEnd>("/api/study/session/end", { session_id: sessionId });
          clearStoredSessionId();
          if (hasProgress) {
            setStoredSummary(summary);
            router.push("/study/summary");
            return;
          }
        }
        router.push("/dashboard");
      } catch {
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
      setQueue((prev) => {
        const existingKeys = new Set(prev.map((i) => i.key));
        const additions = incoming.filter((i) => !existingKeys.has(i.key));
        prefetchKanji(additions);
        const next = [...prev, ...additions];
        maybeEnd(next);
        return next;
      });
    } catch {
      // periodic refresh failures shouldn't interrupt an active session
    }
  }, [prefetchKanji, maybeEnd]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        let sessionId = getStoredSessionId();
        if (sessionId == null) {
          const started = await apiPost<StudySessionStart>("/api/study/session/start");
          sessionId = started.session_id;
          setStoredSessionId(sessionId);
        }
        sessionIdRef.current = sessionId;

        const data = await apiGet<StudyQueueResponse>("/api/study/queue");
        if (cancelled) return;
        const items = buildQueue(data);
        setQueue(items);
        prefetchKanji(items);

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

  const rate = useCallback(
    async (card: DueCard, rating: Rating) => {
      setActionPending(true);
      try {
        await apiPost<ReviewResult>("/api/study/review", reviewBody(card, rating));
        hasProcessedAnyRef.current = true;
        setLastReview({ card });
        setCompletedCount((c) => c + 1);
        setQueue((prev) => {
          const next = prev.filter((i) => i.key !== reviewKey(card));
          maybeEnd(next);
          return next;
        });
        void refreshQueue();
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : "Could not submit your answer. Please try again.", "error");
      } finally {
        setActionPending(false);
      }
    },
    [maybeEnd, refreshQueue, showToast]
  );

  const introduceKanji = useCallback(
    async (item: QueueItem & { kind: "new_kanji" }) => {
      setActionPending(true);
      try {
        try {
          await apiPost("/api/study/kanji/introduce", {
            kanji_id: item.candidate.id,
            session_id: sessionIdRef.current,
          });
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 409)) throw err;
        }
        hasProcessedAnyRef.current = true;
        setCompletedCount((c) => c + 1);
        setQueue((prev) => {
          const next = prev.filter((i) => i.key !== item.key);
          maybeEnd(next);
          return next;
        });
        void refreshQueue();
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : "Could not introduce this kanji. Please try again.", "error");
      } finally {
        setActionPending(false);
      }
    },
    [maybeEnd, refreshQueue, showToast]
  );

  const introduceVocab = useCallback(
    async (item: QueueItem & { kind: "new_vocab" }) => {
      setActionPending(true);
      try {
        try {
          await apiPost("/api/study/vocabulary/introduce", {
            word_id: item.candidate.id,
            session_id: sessionIdRef.current,
          });
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 409)) throw err;
        }
        hasProcessedAnyRef.current = true;
        setCompletedCount((c) => c + 1);
        setQueue((prev) => {
          const next = prev.filter((i) => i.key !== item.key);
          maybeEnd(next);
          return next;
        });
        void refreshQueue();
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : "Could not introduce this word. Please try again.", "error");
      } finally {
        setActionPending(false);
      }
    },
    [maybeEnd, refreshQueue, showToast]
  );

  const undoLast = useCallback(async () => {
    if (!lastReview) return;
    setActionPending(true);
    try {
      await apiPost("/api/study/review/undo");
      setCompletedCount((c) => Math.max(0, c - 1));
      setQueue((prev) => [{ key: reviewKey(lastReview.card), kind: "review", card: lastReview.card }, ...prev]);
      setLastReview(null);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not undo your last answer.", "error");
    } finally {
      setActionPending(false);
    }
  }, [lastReview, showToast]);

  return {
    status,
    error,
    current: queue[0] ?? null,
    completedCount,
    totalKnown: completedCount + queue.length,
    kanjiDetails,
    lastReview,
    actionPending,
    actions: { rate, introduceKanji, introduceVocab, undoLast },
  };
}
