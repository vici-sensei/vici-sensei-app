"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchStudentAchievements,
  fetchStudentDailyActivity,
  fetchStudentDetail,
  fetchStudentTestResults,
} from "@/lib/data/adminStudentDetail";
import { fetchProgressSummary } from "@/lib/data/progress";
import { getErrorMessage } from "@/lib/api/client";
import type {
  AsyncStatus,
  ProgressSummaryResponse,
  StudentAchievement,
  StudentDailyActivity,
  StudentDetail,
  StudentTestResult,
} from "@/lib/types";

export function useStudentDetail(studentId: string | null) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!studentId) return;
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const result = await fetchStudentDetail(createClient(), studentId);
      setData(result);
      setStatus("loaded");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load student."));
      setStatus("error");
    }
  }, [studentId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch };
}

export function useStudentDailyActivity(studentId: string | null) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<StudentDailyActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!studentId) return;
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const result = await fetchStudentDailyActivity(createClient(), studentId);
      setData(result);
      setStatus("loaded");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load activity."));
      setStatus("error");
    }
  }, [studentId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch };
}

export function useStudentTestResults(studentId: string | null) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<StudentTestResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!studentId) return;
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const result = await fetchStudentTestResults(createClient(), studentId);
      setData(result);
      setStatus("loaded");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load test results."));
      setStatus("error");
    }
  }, [studentId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch };
}

export function useStudentProgressSummary(studentId: string | null) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<ProgressSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!studentId) return;
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const result = await fetchProgressSummary(createClient(), studentId);
      setData(result);
      setStatus("loaded");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load progress."));
      setStatus("error");
    }
  }, [studentId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch };
}

export function useStudentAchievements(studentId: string | null) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<StudentAchievement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!studentId) return;
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const result = await fetchStudentAchievements(createClient(), studentId);
      setData(result);
      setStatus("loaded");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load achievements."));
      setStatus("error");
    }
  }, [studentId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch };
}
