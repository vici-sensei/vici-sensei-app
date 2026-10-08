import type { FixedClass, LessonStudent, LessonView } from "./types";
import { localDateKey, weekRange } from "./time";

/** What a student may do with one lesson, decided from the schedule already on screen. The writer
 * (public.lesson_*) re-checks everything and is the authority; this only decides which buttons to
 * show, and why one is missing, so it mirrors the writer's rules (docs/LESSON_BOOKING_PLAN.md):
 *   - a fixed class repeats every week; changing it replaces one of the student's fixed classes;
 *   - "just this week" swaps one of the student's own fixed lessons of that week for this one, or adds
 *     it when the week has room: lessons in the week after <= max(quota, lessons before).
 * The week is the student's local week. */

export const REASON_LOCKED = "Your teacher has locked your lessons. Ask them if you need a change.";
export const REASON_FULL = "This class is full.";
export const REASON_WEEK_FULL =
  "You already have a lesson this week and nothing in it can be swapped. Ask your teacher if you need an extra lesson.";
export const REASON_SAME_CLASS = "You already have a lesson of this class this week.";

export interface WeeklyPlan {
  allowed: boolean;
  reason: string | null;
  /** Fixed classes this one could replace. Empty = it is simply added (the quota has room). */
  replace: FixedClass[];
}

export interface OncePlan {
  allowed: boolean;
  reason: string | null;
  /** The student's own fixed lessons of that week they could give up for this one. */
  swaps: LessonView[];
  /** The week has room for this lesson in addition to what the student already has. */
  canAdd: boolean;
}

/** What the student could ask for on the waitlist of a FULL lesson: the same choices as booking it, minus the
 * seat. null for the part that does not apply (they are already in the class). */
export interface WaitlistPlan {
  weekly: WeeklyPlan | null;
  once: OncePlan | null;
}

export interface LessonPlan {
  /** What the lesson is to this student. */
  state: "started" | "cancelled" | "standing" | "move" | "extra" | "vacated" | "other";
  /** Leave the fixed class this lesson belongs to. */
  leave: { classId: string } | null;
  /** Take back a one-week move: the lesson the move went TO. */
  undoMove: { toClass: string; toDate: string } | null;
  weekly: WeeklyPlan | null;
  once: OncePlan | null;
  /** Why the student cannot change anything here, when that is the case. */
  note: string | null;
  /** The lesson is full and not theirs: they can wait for a seat. */
  waitlist: WaitlistPlan | null;
}

export interface PlanInput {
  lesson: LessonView;
  /** Every lesson loaded for the displayed week (the student's own ones are what matter). */
  all: LessonView[];
  student: LessonStudent;
  nowMs: number;
  tz: string;
  weekStart: number;
}

const NOTHING: Omit<LessonPlan, "state"> = { leave: null, undoMove: null, weekly: null, once: null, note: null, waitlist: null };

export function planLesson({ lesson, all, student, nowMs, tz, weekStart }: PlanInput): LessonPlan {
  if (lesson.cancelled) {
    return {
      ...NOTHING,
      state: "cancelled",
      note: lesson.was_mine ? "This lesson was cancelled. You can pick another class that week." : "This lesson was cancelled.",
    };
  }
  if (lesson.startMs <= nowMs) {
    return { ...NOTHING, state: "started", note: lesson.mine ? null : "This lesson has already started." };
  }

  if (lesson.mine === "standing") {
    return student.can_move
      ? { ...NOTHING, state: "standing", leave: { classId: lesson.class_id } }
      : { ...NOTHING, state: "standing", note: REASON_LOCKED };
  }
  if (lesson.mine === "extra") {
    return { ...NOTHING, state: "extra", note: "Your teacher added you to this lesson. Ask them if you need a change." };
  }
  if (lesson.mine === "move") {
    return student.can_move
      ? { ...NOTHING, state: "move", undoMove: { toClass: lesson.class_id, toDate: lesson.ny_date } }
      : { ...NOTHING, state: "move", note: REASON_LOCKED };
  }
  if (lesson.moved_to) {
    const back = lesson.taken < lesson.capacity;
    return student.can_move
      ? {
          ...NOTHING,
          state: "vacated",
          undoMove: back ? { toClass: lesson.moved_to.class_id, toDate: lesson.moved_to.ny_date } : null,
          note: back ? null : "You gave this lesson up for a week, and its seat has been taken.",
        }
      : { ...NOTHING, state: "vacated", note: REASON_LOCKED };
  }

  const full = lesson.taken >= lesson.capacity;
  return {
    ...NOTHING,
    state: "other",
    weekly: planWeekly(lesson, student, full),
    once: planOnce(lesson, all, student, nowMs, tz, weekStart, full),
    // What they could wait for is what they could book if there were a seat.
    waitlist: full ? { weekly: planWeekly(lesson, student, false), once: planOnce(lesson, all, student, nowMs, tz, weekStart, false) } : null,
  };
}

function planWeekly(lesson: LessonView, student: LessonStudent, full: boolean): WeeklyPlan | null {
  if (student.fixed.some((f) => f.class_id === lesson.class_id)) return null;
  if (full) return { allowed: false, reason: REASON_FULL, replace: [] };
  if (student.fixed.length < student.weekly_quota) return { allowed: true, reason: null, replace: [] };
  if (!student.can_move) return { allowed: false, reason: REASON_LOCKED, replace: [] };
  return { allowed: true, reason: null, replace: student.fixed };
}

function planOnce(
  lesson: LessonView,
  all: LessonView[],
  student: LessonStudent,
  nowMs: number,
  tz: string,
  weekStart: number,
  full: boolean
): OncePlan {
  const none = { swaps: [] as LessonView[], canAdd: false };
  if (!student.can_move) return { allowed: false, reason: REASON_LOCKED, ...none };
  if (full) return { allowed: false, reason: REASON_FULL, ...none };

  const week = weekRange(localDateKey(lesson.startMs, tz), weekStart, tz);
  const mineThisWeek = all.filter((o) => o.mine && o.startMs >= week.startMs && o.startMs < week.endMs);

  if (mineThisWeek.some((o) => o.class_id === lesson.class_id)) return { allowed: false, reason: REASON_SAME_CLASS, ...none };

  // The writer only lets a FIXED lesson be given up, and only one that has not started.
  const swaps = mineThisWeek.filter((o) => o.mine === "standing" && o.startMs > nowMs);
  const canAdd = mineThisWeek.length < student.weekly_quota;
  if (swaps.length === 0 && !canAdd) return { allowed: false, reason: REASON_WEEK_FULL, swaps, canAdd };
  return { allowed: true, reason: null, swaps, canAdd };
}
