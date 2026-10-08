import type { Env } from "./env";
import { json } from "./http";
import { pgSelectOne, pgUpdateWhere } from "./postgrest";
import { isRegion, type Region } from "./region";
import { resolveIdentity } from "./regionMove";
import { serviceAuthHeaders, serviceConfig } from "./supabaseAdmin";

/**
 * Lesson booking API (docs/LESSON_BOOKING_PLAN.md). Every endpoint:
 *   1. re-derives who is calling from their access token, in the region the client says it is in
 *      (resolveIdentity -- the token only validates at the project that issued it, so claiming the
 *      wrong region simply fails);
 *   2. reads the caller's role (users.admin / users.is_teacher) and timezone (user_study_settings)
 *      fresh from THEIR OWN region with the service role -- nothing the client says about its role or
 *      timezone is trusted;
 *   3. calls ONE RPC on the writer, which counts and writes seats in a single transaction.
 * The writer never sees a JWT: its RPCs are service_role-only and take the already-verified facts.
 */

/** The region whose database holds the `lessons` schema (the single writer for seats). Moving it is a
 * migration plus changing this constant -- see the plan, section 2. */
const WRITER_REGION: Region = "eu";

type Role = "student" | "teacher" | "admin";

interface Actor {
  id: string;
  region: Region;
  role: Role;
  isAdmin: boolean;
  isTeacher: boolean;
  tz: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

class BadRequest extends Error {}

function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new BadRequest(`invalid_${field}`);
  return value.toLowerCase();
}

function isoDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new BadRequest(`invalid_${field}`);
  }
  return value;
}

function isoInstant(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > 40 || Number.isNaN(Date.parse(value))) throw new BadRequest(`invalid_${field}`);
  return new Date(value).toISOString();
}

function int(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new BadRequest(`invalid_${field}`);
  return value;
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new BadRequest(`invalid_${field}`);
  return value;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) throw new BadRequest(`invalid_${field}`);
  return value.trim();
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return text(value, field, max);
}

function person(value: unknown, field: string): { region: Region; userId: string } {
  const v = value as { region?: unknown; userId?: unknown } | null;
  if (!v || typeof v.region !== "string" || !isRegion(v.region)) throw new BadRequest(`invalid_${field}`);
  return { region: v.region, userId: uuid(v.userId, field) };
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Actor and writer calls
// ---------------------------------------------------------------------------

interface UserFacts {
  isAdmin: boolean;
  isTeacher: boolean;
  tz: string;
}

/** Role flags and timezone of any account, read from the region it lives in. Null when it has no
 * (live) users row. `tz` is the EFFECTIVE timezone (user_study_settings.timezone already follows the
 * person's manual choice when they made one); UTC only if the row is missing or empty. */
async function readUserFacts(env: Env, region: Region, userId: string): Promise<UserFacts | null> {
  const cfg = serviceConfig(env, region);
  const [profile, settings] = await Promise.all([
    pgSelectOne<{ admin: boolean; is_teacher: boolean; pending_deletion_at: string | null }>(cfg, "users", {
      id: `eq.${userId}`,
      select: "admin,is_teacher,pending_deletion_at",
    }),
    pgSelectOne<{ timezone: string | null }>(cfg, "user_study_settings", { user_id: `eq.${userId}`, select: "timezone" }),
  ]);
  if (!profile || profile.pending_deletion_at) return null;
  return { isAdmin: profile.admin === true, isTeacher: profile.is_teacher === true, tz: settings?.timezone || "UTC" };
}

async function resolveActor(request: Request, env: Env, regionRaw: unknown): Promise<Actor | Response> {
  const identity = await resolveIdentity(request, env, typeof regionRaw === "string" ? regionRaw : null);
  if (identity instanceof Response) return identity;
  const facts = await readUserFacts(env, identity.region, identity.id);
  if (!facts) return json({ error: "account_unavailable" }, 403);
  const role: Role = facts.isAdmin ? "admin" : facts.isTeacher ? "teacher" : "student";
  return { id: identity.id, region: identity.region, role, isAdmin: facts.isAdmin, isTeacher: facts.isTeacher, tz: facts.tz };
}

type WriterResult = { ok: true; data: unknown } | { ok: false; status: number; code: string; detail: string };

const NOT_FOUND = new Set(["class_not_found", "not_enrolled", "not_attending", "not_found", "not_an_occurrence"]);
const FORBIDDEN = new Set(["forbidden", "no_access"]);

function statusFor(code: string): number {
  if (FORBIDDEN.has(code)) return 403;
  if (NOT_FOUND.has(code)) return 404;
  if (code.startsWith("invalid_") || code === "date_in_past") return 400;
  return 409; // class_full, quota_reached, already_*, same_class_twice, time_conflict, too_late, cannot_move, ...
}

async function callWriter(env: Env, fn: string, args: Record<string, unknown>): Promise<WriterResult> {
  const { url, serviceRoleKey } = serviceConfig(env, WRITER_REGION);
  const res = await fetch(new URL(`rest/v1/rpc/${fn}`, url), {
    method: "POST",
    headers: { ...serviceAuthHeaders(serviceRoleKey), "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const raw = await res.text();
  if (res.ok) return { ok: true, data: raw ? JSON.parse(raw) : null };

  let body: { code?: string; message?: string; details?: string } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    // not JSON: fall through to the generic error
  }
  const match = /^lesson:([a-z_]+)$/.exec(body.message ?? "");
  if (body.code === "P0001" && match) {
    return { ok: false, status: statusFor(match[1]), code: match[1], detail: body.details ?? "" };
  }
  // A CHECK constraint (bad weekday/time/capacity/url) or a malformed value: the caller's input.
  if (body.code === "23514" || body.code === "22P02" || body.code === "22007" || body.code === "22023") {
    return { ok: false, status: 400, code: "invalid_value", detail: "" };
  }
  console.error(`lessons writer ${fn}: HTTP ${res.status} ${raw.slice(0, 300)}`);
  return { ok: false, status: 502, code: "writer_error", detail: "" };
}

function answer(result: WriterResult): Response {
  if (result.ok) return json(result.data ?? {});
  return json({ error: result.code, detail: result.detail || undefined }, result.status);
}

/** Runs a handler body, turning input errors into 400 and a missing key / unexpected failure into 5xx. */
async function guarded(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof BadRequest) return json({ error: err.message }, 400);
    console.error("lessons handler failed:", err instanceof Error ? err.message : String(err));
    return json({ error: "server_error" }, 500);
  }
}

// ---------------------------------------------------------------------------
// Student endpoints
// ---------------------------------------------------------------------------

async function studentAction(
  request: Request,
  env: Env,
  fn: string,
  args: (body: Record<string, unknown>) => Record<string, unknown>
): Promise<Response> {
  return guarded(async () => {
    const body = await readBody(request);
    const actor = await resolveActor(request, env, body.region);
    if (actor instanceof Response) return actor;
    if (actor.isTeacher) return json({ error: "teacher_cannot_book" }, 403);
    const built = args(body);
    return answer(await callWriter(env, fn, { p_region: actor.region, p_user_id: actor.id, p_tz: actor.tz, ...built }));
  });
}

async function handleSchedule(request: Request, env: Env, url: URL): Promise<Response> {
  return guarded(async () => {
    const actor = await resolveActor(request, env, url.searchParams.get("region"));
    if (actor instanceof Response) return actor;
    if (actor.isTeacher) return json({ error: "teacher_cannot_book" }, 403);
    const from = isoInstant(url.searchParams.get("from"), "from");
    const to = isoInstant(url.searchParams.get("to"), "to");
    return answer(
      await callWriter(env, "lesson_get_schedule", {
        p_region: actor.region,
        p_user_id: actor.id,
        p_tz: actor.tz,
        p_from: from,
        p_to: to,
      })
    );
  });
}

// ---------------------------------------------------------------------------
// Admin / teacher endpoints
// ---------------------------------------------------------------------------

/** Who may do what: `access` and `quota` are for admins and teachers, classes and the teacher flag for admins only. */
async function staffAction(
  request: Request,
  env: Env,
  allow: "admin" | "staff",
  run: (actor: Actor, body: Record<string, unknown>) => Promise<Response>
): Promise<Response> {
  return guarded(async () => {
    const body = await readBody(request);
    const actor = await resolveActor(request, env, body.region);
    if (actor instanceof Response) return actor;
    const permitted = allow === "admin" ? actor.isAdmin : actor.isAdmin || actor.isTeacher;
    if (!permitted) return json({ error: "forbidden" }, 403);
    return run(actor, body);
  });
}

/** A teacher must really be one: the flag is checked in the teacher's own region, not taken from the request. */
async function requireTeacher(env: Env, teacher: { region: Region; userId: string }): Promise<Response | null> {
  const facts = await readUserFacts(env, teacher.region, teacher.userId);
  if (!facts) return json({ error: "teacher_not_found" }, 404);
  if (!facts.isTeacher) return json({ error: "not_a_teacher" }, 409);
  return null;
}

/** The class fields present in a request, as the column-named keys the writer's `p_changes` expects. */
function classChanges(body: Record<string, unknown>): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  if (body.weekday !== undefined) changes.weekday = int(body.weekday, "weekday", 1, 7);
  if (body.startTime !== undefined) {
    if (typeof body.startTime !== "string" || !TIME_RE.test(body.startTime)) throw new BadRequest("invalid_startTime");
    changes.start_time = body.startTime;
  }
  if (body.durationMin !== undefined) changes.duration_min = int(body.durationMin, "durationMin", 10, 240);
  if (body.capacity !== undefined) changes.capacity = int(body.capacity, "capacity", 1, 3);
  if (body.title !== undefined) changes.title = text(body.title, "title", 80);
  if (body.levelLabel !== undefined) changes.level_label = optionalText(body.levelLabel, "levelLabel", 40);
  if (body.meetingUrl !== undefined) changes.meeting_url = optionalText(body.meetingUrl, "meetingUrl", 500);
  return changes;
}

async function handleAdminStudent(request: Request, env: Env): Promise<Response> {
  return staffAction(request, env, "staff", async (actor, body) => {
    const target = person(body.target, "target");
    const facts = await readUserFacts(env, target.region, target.userId);
    if (!facts) return json({ error: "student_not_found" }, 404);
    const access = bool(body.access, "access");
    const accessUntil = body.accessUntil === null || body.accessUntil === undefined ? null : isoInstant(body.accessUntil, "accessUntil");
    return answer(
      await callWriter(env, "lesson_admin_set_student", {
        p_actor_region: actor.region,
        p_actor_id: actor.id,
        p_actor_role: actor.role,
        p_region: target.region,
        p_user_id: target.userId,
        p_tz: facts.tz,
        p_target_is_teacher: facts.isTeacher,
        p_access: access,
        p_access_until: accessUntil,
        p_can_move: bool(body.canMove, "canMove"),
        p_weekly_quota: int(body.weeklyQuota, "weeklyQuota", 1, 7),
      })
    );
  });
}

async function handleAdminClassCreate(request: Request, env: Env): Promise<Response> {
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
        p_actor_region: actor.region,
        p_actor_id: actor.id,
        p_actor_role: actor.role,
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

async function handleAdminClassUpdate(request: Request, env: Env): Promise<Response> {
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
        p_actor_region: actor.region,
        p_actor_id: actor.id,
        p_actor_role: actor.role,
        p_class_id: uuid(body.classId, "classId"),
        p_effective_from: isoDate(body.effectiveFrom, "effectiveFrom"),
        p_mode: mode,
        p_changes: changes,
      })
    );
  });
}

/** Turns the teacher flag on or off for any account (any region). Becoming a teacher ends the account's
 * life as a student; a teacher with classes cannot be switched off. */
async function handleAdminTeacher(request: Request, env: Env): Promise<Response> {
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

  if (post && path === "/api/lessons/admin/student") return handleAdminStudent(request, env);
  if (post && path === "/api/lessons/admin/class/create") return handleAdminClassCreate(request, env);
  if (post && path === "/api/lessons/admin/class/update") return handleAdminClassUpdate(request, env);
  if (post && path === "/api/lessons/admin/teacher") return handleAdminTeacher(request, env);

  return json({ error: "not_found" }, 404);
}
