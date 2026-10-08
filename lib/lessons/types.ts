/** What `GET /api/lessons/schedule` answers (worker/lib/lessons.ts -> public.lesson_get_schedule), as JSON. */

export interface LessonTeacher {
  region: "eu" | "us";
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface LessonOccurrenceJson {
  class_id: string;
  /** The occurrence's New York calendar date: with class_id it identifies the lesson. */
  ny_date: string;
  starts_at: string;
  ends_at: string;
  /** Where it was before it was moved to another day or time; null when it was not moved. */
  original_starts_at: string | null;
  kind: "weekly" | "one_off";
  title: string;
  level_label: string | null;
  teacher: LessonTeacher;
  /** A substitute teaches this one (teacher is then the substitute). */
  teacher_changed: boolean;
  capacity: number;
  /** Seats taken, the viewer's own included (extra chairs not counted). */
  taken: number;
  /** Not happening: cancelled by a teacher or by a vacation. It holds no seats. */
  cancelled: boolean;
  cancel_reason: string | null;
  /** "standing": a fixed class of the viewer. "move": a one-week move into this lesson. "extra": added
   * by a teacher. null: not theirs. */
  mine: "standing" | "move" | "extra" | null;
  /** A cancelled lesson that would have been the viewer's. */
  was_mine: boolean;
  /** What the teacher marked after the lesson. */
  attendance: "present" | "absent" | null;
  /** Set on a fixed lesson the viewer gave up for a week: where they go instead. */
  moved_to: { class_id: string; ny_date: string } | null;
  /** Only present on the viewer's own lessons. */
  meeting_url: string | null;
}

export interface FixedClass {
  class_id: string;
  from_date: string;
  to_date: string | null;
  title: string;
  level_label: string | null;
  /** ISO weekday (1 = Monday) and wall-clock time in New York. */
  weekday: number;
  start_time: string;
  duration_min: number;
  next_starts_at: string;
}

export interface LessonStudent {
  /** False when the account has no access (never granted, revoked, or access_until has passed). */
  access: boolean;
  access_until: string | null;
  can_move: boolean;
  weekly_quota: number;
  /** The timezone and first weekday the quota's week is judged in. */
  tz: string;
  week_start: number;
  pending: { effective_from: string; tz: string; week_start: number } | null;
  fixed: FixedClass[];
}

export interface LessonScheduleJson {
  student: LessonStudent;
  occurrences: LessonOccurrenceJson[];
}

/** An occurrence with its instants parsed once. */
export interface LessonView extends LessonOccurrenceJson {
  startMs: number;
  endMs: number;
}

export function toLessonView(o: LessonOccurrenceJson): LessonView {
  return { ...o, startMs: Date.parse(o.starts_at), endMs: Date.parse(o.ends_at) };
}

export function lessonKey(o: { class_id: string; ny_date: string }): string {
  return `${o.class_id}|${o.ny_date}`;
}
