"use client";

import { createClient } from "@/lib/supabase/client";
import {
  fetchStudentAchievements,
  fetchStudentDailyActivity,
  fetchStudentDetail,
  fetchStudentNewCardProgress,
  fetchStudentProgressSummary,
  fetchStudentTestResults,
} from "@/lib/data/adminStudentDetail";
import { useRemoteData } from "@/lib/client-data/useRemoteData";

// Each of these loads one section of the admin's student page, for `studentId` (null until it is known).

export function useStudentDetail(studentId: string | null) {
  return useRemoteData({
    params: studentId,
    load: (id) => fetchStudentDetail(createClient(), id),
    errorFallback: "Failed to load student.",
  });
}

export function useStudentDailyActivity(studentId: string | null) {
  return useRemoteData({
    params: studentId,
    load: (id) => fetchStudentDailyActivity(createClient(), id),
    errorFallback: "Failed to load activity.",
  });
}

export function useStudentNewCardProgress(studentId: string | null) {
  return useRemoteData({
    params: studentId,
    load: (id) => fetchStudentNewCardProgress(createClient(), id),
    errorFallback: "Failed to load new-card progress.",
  });
}

export function useStudentTestResults(studentId: string | null) {
  return useRemoteData({
    params: studentId,
    load: (id) => fetchStudentTestResults(createClient(), id),
    errorFallback: "Failed to load test results.",
  });
}

export function useStudentProgressSummary(studentId: string | null) {
  return useRemoteData({
    params: studentId,
    load: (id) => fetchStudentProgressSummary(createClient(), id),
    errorFallback: "Failed to load progress.",
  });
}

export function useStudentAchievements(studentId: string | null) {
  return useRemoteData({
    params: studentId,
    load: (id) => fetchStudentAchievements(createClient(), id),
    errorFallback: "Failed to load achievements.",
  });
}
