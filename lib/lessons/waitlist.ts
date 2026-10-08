/** The student's waitlist entries (public.lesson_waitlist_list) and the small rules the pages share. */

export interface WaitlistEntry {
  id: number;
  /** "fixed": wait for a seat in the weekly class. "once": wait for one lesson, for that week only. */
  kind: "fixed" | "once";
  class_id: string;
  /** The lesson's template New York date (kind "once"). */
  ny_date: string | null;
  title: string | null;
  /** When the lesson (or, for a weekly class, its next lesson) starts. */
  starts_at: string | null;
  /** A seat is free right now: whoever confirms first gets it. */
  available: boolean;
  /** The weekly class they would give up to take this one (kind "fixed"). */
  replace_class: string | null;
  replace_title: string | null;
  /** The lesson they would give up for this one (kind "once"). */
  swap_class: string | null;
  swap_date: string | null;
  swap_title: string | null;
  swap_starts_at: string | null;
  created_at: string;
}

/** At most this many entries per student at once. */
export const WAITLIST_LIMIT = 3;

export function fixedEntryFor(entries: WaitlistEntry[], classId: string): WaitlistEntry | null {
  return entries.find((e) => e.kind === "fixed" && e.class_id === classId) ?? null;
}

export function onceEntryFor(entries: WaitlistEntry[], classId: string, nyDate: string): WaitlistEntry | null {
  return entries.find((e) => e.kind === "once" && e.class_id === classId && e.ny_date === nyDate) ?? null;
}

/** Waiting for this lesson in either way. */
export function isWaitingFor(entries: WaitlistEntry[], lesson: { class_id: string; ny_date: string }): boolean {
  return fixedEntryFor(entries, lesson.class_id) !== null || onceEntryFor(entries, lesson.class_id, lesson.ny_date) !== null;
}
