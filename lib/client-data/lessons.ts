"use client";

import { useCallback } from "react";
import type { User } from "@supabase/auth-js";
import { ApiError, getErrorMessage } from "@/lib/api/client";
import { currentAccessToken } from "@/lib/client-data/account";
import { useRemoteData } from "@/lib/client-data/useRemoteData";
import { getActiveRegion, workerOrigin } from "@/lib/supabase/regions";
import type { LessonScheduleJson } from "@/lib/lessons/types";

/** The lesson booking API (worker/lib/lessons.ts). Same-origin `/api/lessons/*` in production; the
 * Worker reads the caller's role and timezone from their own region, so nothing sent here is trusted
 * beyond "which region is my token from". */

/** A Worker error answer: `code` is the writer's reason ("class_full", "quota_reached", ...). */
export class LessonsApiError extends ApiError {
  code: string;

  constructor(status: number, code: string, message: string) {
    super(status, message);
    this.name = "LessonsApiError";
    this.code = code;
  }
}

const MESSAGES: Record<string, string> = {
  class_full: "That class just filled up.",
  quota_reached: "You already have the most lessons you can have that week.",
  no_access: "Lessons aren't enabled for your account.",
  cannot_move: "Your teacher has locked your lessons, so they can't be changed here.",
  too_late: "That lesson has already started.",
  already_enrolled: "You're already in that class.",
  already_attending: "You're already going to that lesson.",
  same_class_twice: "You already have a lesson of that class that week.",
  time_conflict: "That lesson overlaps another one of yours.",
  not_enrolled: "That isn't one of your weekly classes any more.",
  not_attending: "That isn't one of your lessons any more.",
  not_found: "That change isn't there any more.",
  class_not_found: "That class isn't available any more.",
  not_an_occurrence: "That lesson isn't available any more.",
  teacher_cannot_book: "Teacher accounts don't book lessons.",
  account_unavailable: "Your account isn't available.",
  invalid_range: "That date range isn't valid.",
  forbidden: "You aren't allowed to do that.",
  cancelled: "That lesson is cancelled.",
  too_early: "That can only be done once the lesson has started.",
  invalid_date: "That date is too far from the lesson's usual day (6 days at most).",
  invalid_reason: "Please write a reason.",
  reason_required: "Please write a reason.",
  invalid_value: "Some value isn't allowed. Check the times, the dates and that links start with https://.",
  not_a_weekly_class: "That is a one-off lesson, not a weekly class.",
  one_off_class: "A one-off lesson has no weekly schedule to edit.",
  teacher_has_classes: "That teacher still has classes. Give them to someone else first.",
  not_a_teacher: "That person isn't a teacher account.",
  teacher_not_found: "That teacher account wasn't found.",
  teacher_cannot_be_student: "A teacher account can't be a student.",
  student_not_found: "That student wasn't found.",
  user_not_found: "That account wasn't found.",
  target_exists: "That account already has lessons.",
  date_in_past: "That date has already passed.",
};

/** Codes after which the schedule on screen is probably out of date and worth reloading. */
export const STALE_SCHEDULE_CODES = new Set([
  "class_full",
  "not_enrolled",
  "not_attending",
  "not_found",
  "class_not_found",
  "not_an_occurrence",
  "already_enrolled",
  "already_attending",
  "too_late",
]);

export function lessonErrorMessage(err: unknown): string {
  if (err instanceof LessonsApiError) return MESSAGES[err.code] ?? "Something went wrong. Please try again.";
  return getErrorMessage(err, "Something went wrong. Please try again.");
}

export async function lessonsRequest<T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<T> {
  const token = await currentAccessToken();
  const region = getActiveRegion();
  const url = `${workerOrigin()}${path}${method === "GET" ? `${path.includes("?") ? "&" : "?"}region=${region}` : ""}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify({ region, ...body }) : undefined,
    });
  } catch (err) {
    throw new ApiError(0, getErrorMessage(err, "Couldn't reach the server. Check your connection and try again."));
  }
  const json = (await res.json().catch(() => ({}))) as { error?: unknown };
  if (!res.ok) {
    const code = typeof json.error === "string" ? json.error : "unknown";
    throw new LessonsApiError(res.status, code, MESSAGES[code] ?? "Something went wrong. Please try again.");
  }
  return json as T;
}

export interface ScheduleRange {
  /** ISO instants; the writer answers every lesson that STARTS in [from, to). */
  from: string;
  to: string;
}

export function fetchLessonSchedule(range: ScheduleRange): Promise<LessonScheduleJson> {
  const query = `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
  return lessonsRequest<LessonScheduleJson>("GET", `/api/lessons/schedule${query}`);
}

/** What a schedule request settled on, tagged with the range it was for so a page that has moved on to
 * another week never shows the previous week's answer under the new heading. */
export type LessonScheduleResult =
  | { kind: "ok"; from: string; to: string; schedule: LessonScheduleJson }
  | { kind: "teacher"; from: string; to: string };

export function useLessonSchedule(user: User | null, range: ScheduleRange | null) {
  const load = useCallback(async (r: { userId: string } & ScheduleRange): Promise<LessonScheduleResult> => {
    try {
      return { kind: "ok", from: r.from, to: r.to, schedule: await fetchLessonSchedule(r) };
    } catch (err) {
      // A teacher account has no student calendar: not a failure, a different page.
      if (err instanceof LessonsApiError && err.code === "teacher_cannot_book") return { kind: "teacher", from: r.from, to: r.to };
      throw err;
    }
  }, []);
  return useRemoteData({
    params: user && range ? { userId: user.id, ...range } : null,
    load,
    errorFallback: "Couldn't load your lessons.",
  });
}

export const lessonActions = {
  /** Make `classId` a weekly class, optionally replacing one of the student's current weekly classes. */
  enroll: (classId: string, replaceClassId: string | null = null) =>
    lessonsRequest("POST", "/api/lessons/enroll", { classId, replaceClassId }),
  /** Leave a weekly class. */
  unenroll: (classId: string) => lessonsRequest("POST", "/api/lessons/unenroll", { classId }),
  /** Attend one lesson instead of (or, when `from` is null, in addition to) a weekly lesson. */
  moveOnce: (to: { classId: string; nyDate: string }, from: { classId: string; nyDate: string } | null) =>
    lessonsRequest("POST", "/api/lessons/move", {
      toClass: to.classId,
      toDate: to.nyDate,
      fromClass: from?.classId ?? null,
      fromDate: from?.nyDate ?? null,
    }),
  /** Take back a one-week move (`to` is the lesson the move went to). */
  unmove: (to: { classId: string; nyDate: string }) =>
    lessonsRequest("POST", "/api/lessons/unmove", { toClass: to.classId, toDate: to.nyDate }),
  /** The weekday the student's week starts on (1 = Monday ... 7 = Sunday); applies from next week. */
  setWeekStart: (weekStart: number) => lessonsRequest("POST", "/api/lessons/week-start", { weekStart }),
};
