import type { Env } from "./env";
import { json } from "./http";
import { pgSelectAll, pgUpdateWhere } from "./postgrest";
import type { Region } from "./region";
import { serviceConfig } from "./supabaseAdmin";
import {
  BadRequest,
  actorArgs,
  answer,
  bool,
  callWriter,
  classChanges,
  clock,
  fetchProfiles,
  int,
  isoDate,
  isoInstant,
  optionalText,
  person,
  profileKey,
  profilesToObject,
  readUserFacts,
  requireTeacher,
  staffAction,
  staffRead,
  targetFacts,
  text,
  uuid,
} from "./lessonsCommon";

/**
 * Lesson booking API for teachers and admins (docs/LESSON_BOOKING_PLAN.md, stage 3). A teacher acts
 * only on their own classes and lessons -- the writer checks that, from the actor's identity the Worker
 * has just verified -- and an admin on everything. Reads add names and pictures from each person's own
 * region; emails go to admins only.
 */

type PersonRef = { region?: string | null; user_id?: string | null };

interface TeacherEntry {
  region: Region;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

/** Every teacher account of both regions, for the pickers (class teacher, substitute, vacation). */
async function listTeachers(env: Env): Promise<TeacherEntry[]> {
  const out: TeacherEntry[] = [];
  await Promise.all(
    (["eu", "us"] as const).map(async (region) => {
      try {
        const rows = await pgSelectAll<{ id: string; display_name: string | null; avatar_url: string | null }>(
          serviceConfig(env, region),
          "users",
          { is_teacher: "eq.true", pending_deletion_at: "is.null", select: "id,display_name,avatar_url", order: "created_at.asc" }
        );
        for (const r of rows) out.push({ region, user_id: r.id, display_name: r.display_name, avatar_url: r.avatar_url });
      } catch (err) {
        console.error(`lessons: teachers (${region}):`, err instanceof Error ? err.message : String(err));
      }
    })
  );
  return out;
}

interface DirectoryUser {
  region: Region;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  email?: string | null;
  is_teacher: boolean;
  is_admin: boolean;
}

/** Everyone with a live account in either region: the people a teacher can give lesson access to. */
async function listUsers(env: Env, withEmail: boolean): Promise<DirectoryUser[]> {
  const out: DirectoryUser[] = [];
  await Promise.all(
    (["eu", "us"] as const).map(async (region) => {
      try {
        const rows = await pgSelectAll<{
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          email: string;
          is_teacher: boolean;
          admin: boolean;
          retired_to_region: string | null;
        }>(serviceConfig(env, region), "users", {
          pending_deletion_at: "is.null",
          retired_to_region: "is.null",
          select: "id,display_name,avatar_url,email,is_teacher,admin,retired_to_region",
          order: "created_at.asc",
        });
        for (const r of rows) {
          out.push({
            region,
            user_id: r.id,
            display_name: r.display_name,
            avatar_url: r.avatar_url,
            ...(withEmail ? { email: r.email } : {}),
            is_teacher: r.is_teacher === true,
            is_admin: r.admin === true,
          });
        }
      } catch (err) {
        console.error(`lessons: users (${region}):`, err instanceof Error ? err.message : String(err));
      }
    })
  );
  return out;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

interface OverviewJson {
  classes?: Array<{
    versions?: Array<{ teacher?: PersonRef }>;
    fixed?: PersonRef[];
    extras?: PersonRef[];
  }>;
  occurrences?: Array<{ teacher?: PersonRef; regular_teacher?: PersonRef; attendees?: PersonRef[] }>;
}

function refsOf(data: OverviewJson): PersonRef[] {
  const refs: PersonRef[] = [];
  for (const c of data.classes ?? []) {
    for (const v of c.versions ?? []) if (v.teacher) refs.push(v.teacher);
    refs.push(...(c.fixed ?? []), ...(c.extras ?? []));
  }
  for (const o of data.occurrences ?? []) {
    if (o.teacher) refs.push(o.teacher);
    if (o.regular_teacher) refs.push(o.regular_teacher);
    refs.push(...(o.attendees ?? []));
  }
  return refs;
}

async function handleOverview(request: Request, env: Env, url: URL): Promise<Response> {
  return staffRead(request, env, url, async (actor) => {
    const from = isoInstant(url.searchParams.get("from"), "from");
    const to = isoInstant(url.searchParams.get("to"), "to");
    const result = await callWriter(env, "lesson_staff_get_overview", { ...actorArgs(actor), p_from: from, p_to: to });
    if (!result.ok) return answer(result);
    const data = result.data as OverviewJson;
    const [people, teachers] = await Promise.all([
      fetchProfiles(env, refsOf(data), { email: actor.isAdmin }),
      listTeachers(env),
    ]);
    return json({ role: actor.role, tz: actor.tz, you: { region: actor.region, user_id: actor.id }, ...data, people: profilesToObject(people), teachers });
  });
}

/** Who waits for which class: a teacher sees their own classes, an admin all of them. */
async function handleWaitlist(request: Request, env: Env, url: URL): Promise<Response> {
  return staffRead(request, env, url, async (actor) => {
    const result = await callWriter(env, "lesson_staff_waitlist", actorArgs(actor));
    if (!result.ok) return answer(result);
    const data = result.data as { entries?: PersonRef[] };
    const people = await fetchProfiles(env, data.entries ?? [], { email: actor.isAdmin });
    return json({ ...data, people: profilesToObject(people) });
  });
}

async function handleStudents(request: Request, env: Env, url: URL): Promise<Response> {
  return staffRead(request, env, url, async (actor) => {
    const [writer, users] = await Promise.all([
      callWriter(env, "lesson_staff_list_students", { p_actor_role: actor.role }),
      listUsers(env, actor.isAdmin),
    ]);
    if (!writer.ok) return answer(writer);
    const known = new Map<string, unknown>();
    for (const row of (writer.data as Array<{ region: string; user_id: string }>) ?? []) known.set(profileKey(row.region, row.user_id), row);
    const students = users
      .map((u) => ({ ...u, lessons: known.get(profileKey(u.region, u.user_id)) ?? null }))
      .sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? ""));
    return json({ students });
  });
}

async function handleStudentDetail(request: Request, env: Env, url: URL): Promise<Response> {
  return staffRead(request, env, url, async (actor) => {
    const target = person(
      { region: url.searchParams.get("targetRegion"), userId: url.searchParams.get("userId") },
      "target"
    );
    const facts = await targetFacts(env, target);
    if (facts instanceof Response) return facts;
    const [detail, profiles] = await Promise.all([
      callWriter(env, "lesson_staff_student_detail", { p_actor_role: actor.role, p_region: target.region, p_user_id: target.userId }),
      fetchProfiles(env, [{ region: target.region, user_id: target.userId }], { email: actor.isAdmin }),
    ]);
    if (!detail.ok) return answer(detail);
    return json({
      ...(detail.data as Record<string, unknown>),
      profile: profiles.get(profileKey(target.region, target.userId)) ?? null,
      is_teacher: facts.isTeacher,
      tz: facts.tz,
    });
  });
}

// ---------------------------------------------------------------------------
// Writes: exceptions on one lesson
// ---------------------------------------------------------------------------

function occurrence(body: Record<string, unknown>) {
  return { p_class_id: uuid(body.classId, "classId"), p_ny_date: isoDate(body.nyDate, "nyDate") };
}

function simpleOccurrenceAction(fn: string, extra?: (body: Record<string, unknown>) => Record<string, unknown>) {
  return (request: Request, env: Env) =>
    staffAction(request, env, "staff", async (actor, body) =>
      answer(await callWriter(env, fn, { ...actorArgs(actor), ...occurrence(body), ...(extra ? extra(body) : {}) }))
    );
}

const cancelOccurrence = simpleOccurrenceAction("lesson_staff_cancel_occurrence", (b) => ({
  p_reason: optionalText(b.reason, "reason", 200),
}));
const restoreOccurrence = simpleOccurrenceAction("lesson_staff_restore_occurrence");
const setMeetingUrl = simpleOccurrenceAction("lesson_staff_set_meeting_url", (b) => ({
  p_url: optionalText(b.url, "url", 500),
}));

function moveOccurrence(request: Request, env: Env): Promise<Response> {
  return staffAction(request, env, "staff", async (actor, body) => {
    const hasDate = body.newDate !== undefined && body.newDate !== null;
    return answer(
      await callWriter(env, "lesson_staff_move_occurrence", {
        ...actorArgs(actor),
        ...occurrence(body),
        p_new_date: hasDate ? isoDate(body.newDate, "newDate") : null,
        p_new_time: hasDate ? clock(body.newTime, "newTime") : null,
      })
    );
  });
}

/** A substitute teacher for one lesson (admin only); `teacher: null` puts the regular teacher back. */
function setSubstitute(request: Request, env: Env): Promise<Response> {
  return staffAction(request, env, "admin", async (actor, body) => {
    let teacher: { region: Region; userId: string } | null = null;
    let name: string | null = null;
    if (body.teacher !== null && body.teacher !== undefined) {
      teacher = person(body.teacher, "teacher");
      const notTeacher = await requireTeacher(env, teacher);
      if (notTeacher) return notTeacher;
      const profiles = await fetchProfiles(env, [{ region: teacher.region, user_id: teacher.userId }]);
      name = profiles.get(profileKey(teacher.region, teacher.userId))?.display_name ?? null;
    }
    return answer(
      await callWriter(env, "lesson_staff_set_substitute", {
        ...actorArgs(actor),
        ...occurrence(body),
        p_teacher_region: teacher?.region ?? null,
        p_teacher_id: teacher?.userId ?? null,
        p_teacher_name: name,
      })
    );
  });
}

// ---------------------------------------------------------------------------
// Writes: staff acting for a student
// ---------------------------------------------------------------------------

function forStudent(
  fn: string,
  extra: (body: Record<string, unknown>) => Record<string, unknown>,
  opts: { teacherFlag?: boolean; tz?: boolean } = { teacherFlag: true, tz: true }
) {
  return (request: Request, env: Env) =>
    staffAction(request, env, "staff", async (actor, body) => {
      const target = person(body.target, "target");
      const facts = await targetFacts(env, target);
      if (facts instanceof Response) return facts;
      return answer(
        await callWriter(env, fn, {
          ...actorArgs(actor),
          p_region: target.region,
          p_user_id: target.userId,
          ...(opts.tz === false ? {} : { p_tz: facts.tz }),
          ...(opts.teacherFlag === false ? {} : { p_target_is_teacher: facts.isTeacher }),
          ...extra(body),
        })
      );
    });
}

const staffEnroll = forStudent("lesson_staff_enroll", (b) => ({
  p_class_id: uuid(b.classId, "classId"),
  p_replace_class_id: b.replaceClassId === undefined || b.replaceClassId === null ? null : uuid(b.replaceClassId, "replaceClassId"),
}));

// Leaving and undoing a move need the student's timezone (the writer keeps it current) but not the teacher flag.
const staffUnenroll = forStudent("lesson_staff_unenroll", (b) => ({ p_class_id: uuid(b.classId, "classId") }), { teacherFlag: false });

const staffMoveOnce = forStudent("lesson_staff_move_once", (b) => {
  const hasFrom = b.fromClass !== undefined && b.fromClass !== null;
  return {
    p_to_class: uuid(b.toClass, "toClass"),
    p_to_date: isoDate(b.toDate, "toDate"),
    p_from_class: hasFrom ? uuid(b.fromClass, "fromClass") : null,
    p_from_date: hasFrom ? isoDate(b.fromDate, "fromDate") : null,
  };
});

const staffUnmove = forStudent(
  "lesson_staff_unmove",
  (b) => ({ p_to_class: uuid(b.toClass, "toClass"), p_to_date: isoDate(b.toDate, "toDate") }),
  { teacherFlag: false }
);

const addExtra = forStudent("lesson_staff_add_extra", (b) => ({
  p_class_id: uuid(b.classId, "classId"),
  p_from_date: isoDate(b.fromDate, "fromDate"),
  p_to_date: b.toDate === undefined || b.toDate === null ? null : isoDate(b.toDate, "toDate"),
  p_reason: text(b.reason, "reason", 200),
}));

function removeExtra(request: Request, env: Env): Promise<Response> {
  return staffAction(request, env, "staff", async (actor, body) =>
    answer(await callWriter(env, "lesson_staff_remove_extra", { ...actorArgs(actor), p_id: int(body.id, "id", 1, Number.MAX_SAFE_INTEGER) }))
  );
}

const markAttendance = forStudent(
  "lesson_staff_mark_attendance",
  (b) => ({
    ...occurrence(b),
    p_status: b.status === null || b.status === undefined ? null : text(b.status, "status", 10),
  }),
  { teacherFlag: false, tz: false }
);

// ---------------------------------------------------------------------------
// Writes: admin / teacher access, classes, vacations, the teacher flag
// ---------------------------------------------------------------------------

function setStudentAccess(request: Request, env: Env): Promise<Response> {
  return staffAction(request, env, "staff", async (actor, body) => {
    const target = person(body.target, "target");
    const facts = await targetFacts(env, target);
    if (facts instanceof Response) return facts;
    const accessUntil = body.accessUntil === null || body.accessUntil === undefined ? null : isoInstant(body.accessUntil, "accessUntil");
    return answer(
      await callWriter(env, "lesson_admin_set_student", {
        ...actorArgs(actor),
        p_region: target.region,
        p_user_id: target.userId,
        p_tz: facts.tz,
        p_target_is_teacher: facts.isTeacher,
        p_access: bool(body.access, "access"),
        p_access_until: accessUntil,
        p_can_move: bool(body.canMove, "canMove"),
        p_weekly_quota: int(body.weeklyQuota, "weeklyQuota", 1, 7),
      })
    );
  });
}

function createClass(request: Request, env: Env): Promise<Response> {
  return staffAction(request, env, "admin", async (actor, body) => {
    const teacher = person(body.teacher, "teacher");
    const notTeacher = await requireTeacher(env, teacher);
    if (notTeacher) return notTeacher;
    const c = classChanges(body);
    for (const required of ["weekday", "start_time", "duration_min", "capacity", "title"]) {
      if (c[required] === undefined) throw new BadRequest(`missing_${required}`);
    }
    return answer(
      await callWriter(env, "lesson_admin_create_class", {
        ...actorArgs(actor),
        p_teacher_region: teacher.region,
        p_teacher_id: teacher.userId,
        p_weekday: c.weekday,
        p_start_time: c.start_time,
        p_duration_min: c.duration_min,
        p_capacity: c.capacity,
        p_title: c.title,
        p_level_label: c.level_label ?? null,
        p_meeting_url: c.meeting_url ?? null,
        p_valid_from: isoDate(body.validFrom, "validFrom"),
      })
    );
  });
}

function updateClass(request: Request, env: Env): Promise<Response> {
  return staffAction(request, env, "admin", async (actor, body) => {
    const mode = body.mode;
    if (mode !== "follow" && mode !== "release" && mode !== "end") throw new BadRequest("invalid_mode");
    const changes = classChanges(body);
    if (body.teacher !== undefined) {
      const teacher = person(body.teacher, "teacher");
      const notTeacher = await requireTeacher(env, teacher);
      if (notTeacher) return notTeacher;
      changes.teacher_region = teacher.region;
      changes.teacher_id = teacher.userId;
    }
    return answer(
      await callWriter(env, "lesson_admin_update_class", {
        ...actorArgs(actor),
        p_class_id: uuid(body.classId, "classId"),
        p_effective_from: isoDate(body.effectiveFrom, "effectiveFrom"),
        p_mode: mode,
        p_changes: changes,
      })
    );
  });
}

function createOneOff(request: Request, env: Env): Promise<Response> {
  return staffAction(request, env, "admin", async (actor, body) => {
    const teacher = person(body.teacher, "teacher");
    const notTeacher = await requireTeacher(env, teacher);
    if (notTeacher) return notTeacher;
    return answer(
      await callWriter(env, "lesson_admin_create_oneoff", {
        ...actorArgs(actor),
        p_teacher_region: teacher.region,
        p_teacher_id: teacher.userId,
        p_ny_date: isoDate(body.nyDate, "nyDate"),
        p_start_time: clock(body.startTime, "startTime"),
        p_duration_min: int(body.durationMin, "durationMin", 10, 240),
        p_capacity: int(body.capacity, "capacity", 1, 3),
        p_title: text(body.title, "title", 80),
        p_level_label: optionalText(body.levelLabel, "levelLabel", 40),
        p_meeting_url: optionalText(body.meetingUrl, "meetingUrl", 500),
      })
    );
  });
}

function addVacation(request: Request, env: Env): Promise<Response> {
  return staffAction(request, env, "admin", async (actor, body) => {
    const scope = body.scope;
    if (scope !== "global" && scope !== "teacher") throw new BadRequest("invalid_scope");
    let teacher: { region: Region; userId: string } | null = null;
    if (scope === "teacher") {
      teacher = person(body.teacher, "teacher");
      const notTeacher = await requireTeacher(env, teacher);
      if (notTeacher) return notTeacher;
    }
    return answer(
      await callWriter(env, "lesson_admin_add_vacation", {
        ...actorArgs(actor),
        p_scope: scope,
        p_teacher_region: teacher?.region ?? null,
        p_teacher_id: teacher?.userId ?? null,
        p_from_date: isoDate(body.fromDate, "fromDate"),
        p_to_date: isoDate(body.toDate, "toDate"),
        p_reason: optionalText(body.reason, "reason", 200),
      })
    );
  });
}

function deleteVacation(request: Request, env: Env): Promise<Response> {
  return staffAction(request, env, "admin", async (actor, body) =>
    answer(await callWriter(env, "lesson_admin_delete_vacation", { ...actorArgs(actor), p_id: int(body.id, "id", 1, Number.MAX_SAFE_INTEGER) }))
  );
}

/** Turns the teacher flag on or off for any account (any region). Becoming a teacher ends the account's
 * life as a student; a teacher with classes cannot be switched off. */
function setTeacherFlag(request: Request, env: Env): Promise<Response> {
  return staffAction(request, env, "admin", async (_actor, body) => {
    const target = person(body.target, "target");
    const makeTeacher = bool(body.isTeacher, "isTeacher");
    const facts = await readUserFacts(env, target.region, target.userId);
    if (!facts) return json({ error: "user_not_found" }, 404);
    if (facts.isTeacher === makeTeacher) return json({ isTeacher: makeTeacher });

    if (makeTeacher) {
      // Free the seats first: if this fails the flag is still off and nothing changed.
      const dropped = await callWriter(env, "lesson_student_became_teacher", { p_region: target.region, p_user_id: target.userId });
      if (!dropped.ok) return answer(dropped);
    } else {
      const classes = await callWriter(env, "lesson_teacher_class_count", { p_region: target.region, p_user_id: target.userId });
      if (!classes.ok) return answer(classes);
      if (Number(classes.data) > 0) return json({ error: "teacher_has_classes", classes: Number(classes.data) }, 409);
    }
    await pgUpdateWhere(serviceConfig(env, target.region), "users", { id: `eq.${target.userId}` }, { is_teacher: makeTeacher });
    return json({ isTeacher: makeTeacher });
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Handles the staff half of /api/lessons/*; null when the request is not one of ours. */
export async function routeStaff(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const get = request.method === "GET";
  const post = request.method === "POST";

  if (get && path === "/api/lessons/staff/overview") return handleOverview(request, env, url);
  if (get && path === "/api/lessons/staff/students") return handleStudents(request, env, url);
  if (get && path === "/api/lessons/staff/waitlist") return handleWaitlist(request, env, url);
  if (get && path === "/api/lessons/staff/student") return handleStudentDetail(request, env, url);

  if (!post) return null;
  switch (path) {
    case "/api/lessons/staff/cancel": return cancelOccurrence(request, env);
    case "/api/lessons/staff/restore": return restoreOccurrence(request, env);
    case "/api/lessons/staff/move-occurrence": return moveOccurrence(request, env);
    case "/api/lessons/staff/meeting-url": return setMeetingUrl(request, env);
    case "/api/lessons/staff/substitute": return setSubstitute(request, env);
    case "/api/lessons/staff/enroll": return staffEnroll(request, env);
    case "/api/lessons/staff/unenroll": return staffUnenroll(request, env);
    case "/api/lessons/staff/move-once": return staffMoveOnce(request, env);
    case "/api/lessons/staff/unmove": return staffUnmove(request, env);
    case "/api/lessons/staff/extra/add": return addExtra(request, env);
    case "/api/lessons/staff/extra/remove": return removeExtra(request, env);
    case "/api/lessons/staff/attendance": return markAttendance(request, env);
    case "/api/lessons/admin/student": return setStudentAccess(request, env);
    case "/api/lessons/admin/class/create": return createClass(request, env);
    case "/api/lessons/admin/class/update": return updateClass(request, env);
    case "/api/lessons/admin/oneoff": return createOneOff(request, env);
    case "/api/lessons/admin/vacation/add": return addVacation(request, env);
    case "/api/lessons/admin/vacation/delete": return deleteVacation(request, env);
    case "/api/lessons/admin/teacher": return setTeacherFlag(request, env);
    default: return null;
  }
}
