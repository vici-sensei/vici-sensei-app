"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchReadingTestAttempt,
  fetchReadingTestPassed,
  fetchReadingTestProgress,
  fetchReadingTestSentences,
  resetWrongAnswers,
  submitReadingTestAnswer,
  type ReadingTestAnswer,
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
    (sentenceId: number, correct: boolean, userAnswer: string) => {
      setProgress((prev) => new Map(prev).set(sentenceId, { correct, userAnswer }));
      return submitReadingTestAnswer(createClient(), userId, testType, sentenceId, correct, userAnswer);
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
