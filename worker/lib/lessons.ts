import type { Env } from "./env";
import { json } from "./http";
import {
  answer,
  callWriter,
  fetchProfiles,
  guarded,
  int,
  isoDate,
  isoInstant,
  profileKey,
  resolveActor,
  studentAction,
  uuid,
} from "./lessonsCommon";
import { routeNotifications } from "./lessonsNotify";
import { routeStaff } from "./lessonsStaff";
import { routeWaitlist } from "./lessonsWaitlist";

/**
 * Lesson booking API (docs/LESSON_BOOKING_PLAN.md) for STUDENTS: their calendar and the changes they
 * make to it. Teachers and admins are in lessonsStaff.ts; what every endpoint does first (who is
 * calling, which region, what the writer is) is in lessonsCommon.ts.
 */

// ---------------------------------------------------------------------------
// Student endpoints
// ---------------------------------------------------------------------------

interface TeacherRef {
  region?: string;
  user_id?: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

/** The writer only knows a teacher as (region, user id); the page wants a name and a picture. They live
 * in the teacher's own region (users.display_name / avatar_url). A lookup that fails leaves the name
 * empty -- the schedule is still worth showing. */
async function addTeacherNames(env: Env, data: unknown): Promise<void> {
  const occurrences = (data as { occurrences?: Array<{ teacher?: TeacherRef }> } | null)?.occurrences;
  if (!Array.isArray(occurrences)) return;
  const profiles = await fetchProfiles(env, occurrences.map((o) => o.teacher ?? {}));
  for (const occ of occurrences) {
    const t = occ.teacher;
    if (!t?.region || !t.user_id) continue;
    const profile = profiles.get(profileKey(t.region, t.user_id));
    t.display_name = profile?.display_name ?? null;
    t.avatar_url = profile?.avatar_url ?? null;
  }
}

async function handleSchedule(request: Request, env: Env, url: URL): Promise<Response> {
  return guarded(async () => {
    const actor = await resolveActor(request, env, url.searchParams.get("region"));
    if (actor instanceof Response) return actor;
    if (actor.isTeacher) return json({ error: "teacher_cannot_book" }, 403);
    const from = isoInstant(url.searchParams.get("from"), "from");
    const to = isoInstant(url.searchParams.get("to"), "to");
    const result = await callWriter(env, "lesson_get_schedule", {
      p_region: actor.region,
      p_user_id: actor.id,
      p_tz: actor.tz,
      p_from: from,
      p_to: to,
    });
    if (result.ok) await addTeacherNames(env, result.data);
    return answer(result);
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Handles /api/lessons/*; null when the request is not one of ours. */
export async function routeLessons(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/lessons/")) return null;
  const post = request.method === "POST";

  if (request.method === "GET" && path === "/api/lessons/schedule") return handleSchedule(request, env, url);

  if (post && path === "/api/lessons/enroll") {
    return studentAction(request, env, "lesson_enroll", (b) => ({
      p_class_id: uuid(b.classId, "classId"),
      p_replace_class_id: b.replaceClassId === undefined || b.replaceClassId === null ? null : uuid(b.replaceClassId, "replaceClassId"),
    }));
  }
  if (post && path === "/api/lessons/unenroll") {
    return studentAction(request, env, "lesson_unenroll", (b) => ({ p_class_id: uuid(b.classId, "classId") }));
  }
  if (post && path === "/api/lessons/move") {
    return studentAction(request, env, "lesson_move_once", (b) => {
      const hasFrom = b.fromClass !== undefined && b.fromClass !== null;
      return {
        p_to_class: uuid(b.toClass, "toClass"),
        p_to_date: isoDate(b.toDate, "toDate"),
        p_from_class: hasFrom ? uuid(b.fromClass, "fromClass") : null,
        p_from_date: hasFrom ? isoDate(b.fromDate, "fromDate") : null,
      };
    });
  }
  if (post && path === "/api/lessons/unmove") {
    return studentAction(request, env, "lesson_unmove", (b) => ({
      p_to_class: uuid(b.toClass, "toClass"),
      p_to_date: isoDate(b.toDate, "toDate"),
    }));
  }
  if (post && path === "/api/lessons/week-start") {
    return studentAction(request, env, "lesson_set_week_start", (b) => ({ p_week_start: int(b.weekStart, "weekStart", 1, 7) }));
  }

  const notifications = await routeNotifications(request, env, url);
  if (notifications) return notifications;

  const waitlist = await routeWaitlist(request, env, url);
  if (waitlist) return waitlist;

  const staff = await routeStaff(request, env, url);
  if (staff) return staff;

  return json({ error: "not_found" }, 404);
}
