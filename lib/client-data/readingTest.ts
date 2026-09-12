"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  advanceReadingTestQueue,
  clearReadingTestDraft,
  ensureReadingTestQueue,
  fetchReadingTestAttempt,
  fetchReadingTestPassed,
  fetchReadingTestProgress,
  fetchReadingTestSentences,
  fetchReadingTestSession,
  markReadingTestStarted,
  resetWrongAnswers,
  saveReadingTestDraft,
  submitReadingTestAnswer,
  type ReadingTestAnswer,
  type ReadingTestSession,
} from "@/lib/data/readingTest";
import { getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus, ReadingTestSentence } from "@/lib/types";

/** Loads the whole fixed text once -- same reference-data shape as useHiraganaList, but this
 * table has no other reader/prefetch site yet, so no localCache/createPrefetcher wiring. */
export function useReadingTestSentences(testType: string): {
  data: ReadingTestSentence[] | null;
  status: AsyncStatus;
  error: string | null;
} {
  const [data, setData] = useState<ReadingTestSentence[] | null>(null);
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchReadingTestSentences(createClient(), testType)
      .then((rows) => {
        if (cancelled) return;
        setData(rows);
        setStatus("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err, "Failed to load."));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [testType]);

  return { data, status, error };
}

/** Every sentence already attempted for this test, right or wrong (see
 * user_reading_test_progress's doc comment -- a sentence missing from this map is still pending).
 * markAnswered persists a Check result and updates the map optimistically; retryWrong reopens
 * every wrong sentence (deletes those entries, both locally and server-side) for the "Retry the
 * ones I got wrong" flow. Both return the underlying persist promise so a caller can surface a
 * failure (e.g. via a toast) without this hook needing to know about UI. */
export function useReadingTestProgress(
  userId: string,
  testType: string
): {
  progress: Map<number, ReadingTestAnswer> | null;
  status: AsyncStatus;
  error: string | null;
  markAnswered: (sentenceId: number, correct: boolean, userAnswer: string) => Promise<void>;
  retryWrong: () => Promise<void>;
} {
  const [progress, setProgress] = useState<Map<number, ReadingTestAnswer> | null>(null);
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchReadingTestProgress(createClient(), userId, testType)
      .then((rows) => {
        if (cancelled) return;
        setProgress(rows);
        setStatus("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err, "Failed to load."));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, testType]);

  const markAnswered = useCallback(
    async (sentenceId: number, correct: boolean, userAnswer: string) => {
      setProgress((prev) => new Map(prev).set(sentenceId, { correct, userAnswer }));
      // The server may return a different (correct, userAnswer) than what was just submitted here --
      // another device's Check for this same sentence landed first (see
      // reading_test_submit_answer) -- so this device's optimistic guess above must be reconciled
      // to whichever result is now actually stored, not left showing its own.
      const authoritative = await submitReadingTestAnswer(createClient(), userId, testType, sentenceId, correct, userAnswer);
      setProgress((prev) => new Map(prev).set(sentenceId, authoritative));
    },
    [userId, testType]
  );

  const retryWrong = useCallback(() => {
    setProgress((prev) => {
      if (!prev) return prev;
      const next = new Map(prev);
      for (const [id, answer] of prev) if (!answer.correct) next.delete(id);
      return next;
    });
    return resetWrongAnswers(createClient(), userId, testType);
  }, [userId, testType]);

  return { progress, status, error, markAnswered, retryWrong };
}

export async function fetchReadingTestPassedStatus(userId: string, testType: string): Promise<boolean> {
  return fetchReadingTestPassed(createClient(), userId, testType);
}

/** This pass's resume state -- see user_reading_test_attempts' doc comment
 * (20261106_reading_test_resume_state.sql). All four mutators return the underlying persist
 * promise, same as useReadingTestProgress's markAnswered/retryWrong, so a caller can surface a
 * failure without this hook needing to know about UI; each also updates local state optimistically
 * first so the current tab doesn't wait on the round-trip. */
export function useReadingTestSession(
  userId: string,
  testType: string
): {
  session: ReadingTestSession | null;
  status: AsyncStatus;
  error: string | null;
  markStarted: () => Promise<void>;
  ensureQueue: (queue: number[]) => Promise<number[]>;
  advance: (position: number) => Promise<number>;
  saveDraft: (sentenceId: number, answer: string) => Promise<void>;
  clearDraft: () => Promise<void>;
} {
  const [session, setSession] = useState<ReadingTestSession | null>(null);
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchReadingTestSession(createClient(), userId, testType)
      .then((data) => {
        if (cancelled) return;
        setSession(data);
        setStatus("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err, "Failed to load."));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, testType]);

  const markStarted = useCallback(() => {
    setSession((prev) => (prev ? { ...prev, started: true } : prev));
    return markReadingTestStarted(createClient(), userId, testType);
  }, [userId, testType]);

  const ensureQueue = useCallback(
    async (queue: number[]) => {
      const authoritative = await ensureReadingTestQueue(createClient(), userId, testType, queue);
      setSession((prev) => (prev ? { ...prev, queueOrder: authoritative } : prev));
      return authoritative;
    },
    [userId, testType]
  );

  const advance = useCallback(
    async (position: number) => {
      setSession((prev) => (prev ? { ...prev, queuePosition: position } : prev));
      const authoritative = await advanceReadingTestQueue(createClient(), userId, testType, position);
      setSession((prev) => (prev ? { ...prev, queuePosition: authoritative } : prev));
      return authoritative;
    },
    [userId, testType]
  );

  const saveDraft = useCallback(
    (sentenceId: number, answer: string) => saveReadingTestDraft(createClient(), userId, testType, sentenceId, answer),
    [userId, testType]
  );

  const clearDraft = useCallback(() => clearReadingTestDraft(createClient(), userId, testType), [userId, testType]);

  return { session, status, error, markStarted, ensureQueue, advance, saveDraft, clearDraft };
}

/** Which attempt of this test the user is currently on (see fetchReadingTestAttempt) -- fetched
 * once per mount, since the only thing that changes it (retryWrong above) lives on a different
 * page than the summary screen that displays it. */
export function useReadingTestAttempt(
  userId: string,
  testType: string
): { attempt: number | null; status: AsyncStatus; error: string | null } {
  const [attempt, setAttempt] = useState<number | null>(null);
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchReadingTestAttempt(createClient(), userId, testType)
      .then((value) => {
        if (cancelled) return;
        setAttempt(value);
        setStatus("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err, "Failed to load."));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, testType]);

  return { attempt, status, error };
}
