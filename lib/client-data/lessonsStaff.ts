"use client";

import { useCallback } from "react";
import type { User } from "@supabase/auth-js";
import { lessonsRequest, type ScheduleRange } from "@/lib/client-data/lessons";
import { useRemoteData } from "@/lib/client-data/useRemoteData";

/** The teachers' and admins' side of the lesson API (worker/lib/lessonsStaff.ts). A teacher only ever
 * gets their own classes and lessons back; the server decides, nothing here is a permission check. */

export type Region = "eu" | "us";

export interface PersonRef {
  region: Region;
  user_id: string;
}

export interface Profile {
  display_name: string | null;
  avatar_url: string | null;
  is_teacher: boolean;
  /** Admins only. */
  email?: string | null;
}

export interface StaffVersion {
  id: string;
  valid_from: string;
  valid_until: string | null;
  /** ISO weekday (1 = Monday) and wall-clock time in New York. */
  weekday: number;
  start_time: string;
  duration_min: number;
  capacity: number;
  title: string;
  level_label: string | null;
  meeting_url: string | null;
  teacher: PersonRef;
}

export interface StaffExtra extends PersonRef {
  id: number;
  from_date: string;
  to_date: string | null;
  reason: string | null;
}

export interface StaffClass {
  class_id: string;
  kind: "weekly" | "one_off";
  versions: StaffVersion[];
  fixed: PersonRef[];
  extras: StaffExtra[];
}

export interface StaffAttendee extends PersonRef {
  source: "standing" | "move" | "extra";
  attendance: "present" | "absent" | null;
}

export interface StaffOccurrence {
  class_id: string;
  ny_date: string;
  starts_at: string;
  ends_at: string;
  original_starts_at: string | null;
  kind: "weekly" | "one_off";
  title: string;
  level_label: string | null;
  capacity: number;
  teacher: PersonRef;
  regular_teacher: PersonRef;
  meeting_url: string | null;
  cancelled: boolean;
  cancelled_by_vacation: boolean;
  cancel_reason: string | null;
  taken: number;
  attendees: StaffAttendee[];
}

export interface StaffVacation {
  id: number;
  scope: "global" | "teacher";
  teacher: PersonRef | null;
  from_date: string;
  to_date: string;
  reason: string | null;
}

export interface TeacherEntry extends PersonRef {
  display_name: string | null;
  avatar_url: string | null;
}

export interface StaffOverview {
  role: "admin" | "teacher";
  tz: string;
  you: PersonRef;
  classes: StaffClass[];
  occurrences: StaffOccurrence[];
  vacations: StaffVacation[];
  people: Record<string, Profile>;
  teachers: TeacherEntry[];
}

export interface StudentLessonState {
  region: Region;
  user_id: string;
  access: boolean;
  access_until: string | null;
  has_access: boolean;
  can_move: boolean;
  weekly_quota: number;
  tz: string | null;
  fixed: number;
}

export interface DirectoryStudent extends PersonRef {
  display_name: string | null;
  avatar_url: string | null;
  email?: string | null;
  is_teacher: boolean;
  is_admin: boolean;
  lessons: StudentLessonState | null;
}

export interface StudentDetail {
  known: boolean;
  has_access?: boolean;
  access?: boolean;
  access_until?: string | null;
  can_move?: boolean;
  weekly_quota?: number;
  fixed?: Array<{ class_id: string; title: string; from_date: string; next_starts_at: string }>;
  upcoming?: Array<{ class_id: string; ny_date: string; starts_at: string; source: string; title: string }>;
  history?: Array<{ class_id: string; ny_date: string; status: "present" | "absent"; title: string }>;
  profile: Profile | null;
  is_teacher: boolean;
  tz: string;
}

export const profileKey = (p: PersonRef) => `${p.region}:${p.user_id}`;
export const personName = (people: Record<string, Profile>, p: PersonRef) => people[profileKey(p)]?.display_name?.trim() || "Unnamed";

export const fetchStaffOverview = (range: ScheduleRange) =>
  lessonsRequest<StaffOverview>("GET", `/api/lessons/staff/overview?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`);

export const fetchStaffStudents = () => lessonsRequest<{ students: DirectoryStudent[] }>("GET", "/api/lessons/staff/students");

export const fetchStudentDetail = (target: PersonRef) =>
  lessonsRequest<StudentDetail>("GET", `/api/lessons/staff/student?targetRegion=${target.region}&userId=${target.user_id}`);

const who = (p: PersonRef) => ({ region: p.region, userId: p.user_id });

export const staffActions = {
  cancel: (classId: string, nyDate: string, reason: string | null) =>
    lessonsRequest("POST", "/api/lessons/staff/cancel", { classId, nyDate, reason }),
  restore: (classId: string, nyDate: string) => lessonsRequest("POST", "/api/lessons/staff/restore", { classId, nyDate }),
  /** `to` null puts the lesson back at its usual day and time. */
  moveOccurrence: (classId: string, nyDate: string, to: { date: string; time: string } | null) =>
    lessonsRequest<{ starts_at: string; conflicts: PersonRef[] }>("POST", "/api/lessons/staff/move-occurrence", {
      classId,
      nyDate,
      newDate: to?.date ?? null,
      newTime: to?.time ?? null,
    }),
  setMeetingUrl: (classId: string, nyDate: string, url: string | null) =>
    lessonsRequest("POST", "/api/lessons/staff/meeting-url", { classId, nyDate, url }),
  setSubstitute: (classId: string, nyDate: string, teacher: PersonRef | null) =>
    lessonsRequest("POST", "/api/lessons/staff/substitute", { classId, nyDate, teacher: teacher ? who(teacher) : null }),
  enroll: (student: PersonRef, classId: string, replaceClassId: string | null = null) =>
    lessonsRequest("POST", "/api/lessons/staff/enroll", { target: who(student), classId, replaceClassId }),
  unenroll: (student: PersonRef, classId: string) =>
    lessonsRequest("POST", "/api/lessons/staff/unenroll", { target: who(student), classId }),
  moveOnce: (student: PersonRef, to: { classId: string; nyDate: string }, from: { classId: string; nyDate: string } | null) =>
    lessonsRequest("POST", "/api/lessons/staff/move-once", {
      target: who(student),
      toClass: to.classId,
      toDate: to.nyDate,
      fromClass: from?.classId ?? null,
      fromDate: from?.nyDate ?? null,
    }),
  unmove: (student: PersonRef, to: { classId: string; nyDate: string }) =>
    lessonsRequest("POST", "/api/lessons/staff/unmove", { target: who(student), toClass: to.classId, toDate: to.nyDate }),
  addExtra: (student: PersonRef, classId: string, fromDate: string, toDate: string | null, reason: string) =>
    lessonsRequest("POST", "/api/lessons/staff/extra/add", { target: who(student), classId, fromDate, toDate, reason }),
  removeExtra: (id: number) => lessonsRequest("POST", "/api/lessons/staff/extra/remove", { id }),
  markAttendance: (student: PersonRef, classId: string, nyDate: string, status: "present" | "absent" | null) =>
    lessonsRequest("POST", "/api/lessons/staff/attendance", { target: who(student), classId, nyDate, status }),
  setAccess: (student: PersonRef, access: { access: boolean; accessUntil: string | null; canMove: boolean; weeklyQuota: number }) =>
    lessonsRequest("POST", "/api/lessons/admin/student", { target: who(student), ...access }),
  createClass: (c: ClassFields & { teacher: PersonRef; validFrom: string }) =>
    lessonsRequest<{ class_id: string }>("POST", "/api/lessons/admin/class/create", { ...c, teacher: who(c.teacher) }),
  updateClass: (
    classId: string,
    effectiveFrom: string,
    mode: "follow" | "release" | "end",
    changes: Partial<ClassFields> & { teacher?: PersonRef }
  ) =>
    lessonsRequest<{ class_id: string; affected: PersonRef[]; dropped_moves: number }>("POST", "/api/lessons/admin/class/update", {
      classId,
      effectiveFrom,
      mode,
      ...changes,
      teacher: changes.teacher ? who(changes.teacher) : undefined,
    }),
  createOneOff: (c: OneOffFields & { teacher: PersonRef; nyDate: string }) =>
    lessonsRequest<{ class_id: string }>("POST", "/api/lessons/admin/oneoff", { ...c, teacher: who(c.teacher) }),
  addVacation: (v: { scope: "global" | "teacher"; teacher?: PersonRef; fromDate: string; toDate: string; reason: string | null }) =>
    lessonsRequest<{ id: number; affected: PersonRef[] }>("POST", "/api/lessons/admin/vacation/add", {
      ...v,
      teacher: v.teacher ? who(v.teacher) : undefined,
    }),
  deleteVacation: (id: number) => lessonsRequest("POST", "/api/lessons/admin/vacation/delete", { id }),
  setTeacher: (user: PersonRef, isTeacher: boolean) =>
    lessonsRequest<{ isTeacher: boolean }>("POST", "/api/lessons/admin/teacher", { target: who(user), isTeacher }),
};

/** A one-off lesson has a date instead of a weekday. */
export type OneOffFields = Omit<ClassFields, "weekday">;

export interface ClassFields {
  weekday: number;
  startTime: string;
  durationMin: number;
  capacity: number;
  title: string;
  levelLabel: string | null;
  meetingUrl: string | null;
}

export function useStaffOverview(user: User | null, range: ScheduleRange | null) {
  const load = useCallback((r: { userId: string } & ScheduleRange) => fetchStaffOverview(r).then((overview) => ({ ...r, overview })), []);
  return useRemoteData({
    params: user && range ? { userId: user.id, ...range } : null,
    load,
    errorFallback: "Couldn't load the lessons.",
  });
}

export function useStaffStudents(user: User | null) {
  const load = useCallback(() => fetchStaffStudents().then((r) => r.students), []);
  return useRemoteData({ params: user ? { userId: user.id } : null, load, errorFallback: "Couldn't load the students." });
}
