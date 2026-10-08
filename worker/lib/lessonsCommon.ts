import type { Env } from "./env";
import { json } from "./http";
import { pgSelectAll, pgSelectOne } from "./postgrest";
import { isRegion, type Region } from "./region";
import { resolveIdentity } from "./regionMove";
import { serviceAuthHeaders, serviceConfig } from "./supabaseAdmin";

/**
 * Shared by the lesson booking endpoints (lessons.ts for students, lessonsStaff.ts for teachers and
 * admins). Every endpoint:
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
export const WRITER_REGION: Region = "eu";

export type Role = "student" | "teacher" | "admin";

export interface Actor {
  id: string;
  region: Region;
  role: Role;
  isAdmin: boolean;
  isTeacher: boolean;
  tz: string;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class BadRequest extends Error {}

export function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new BadRequest(`invalid_${field}`);
  return value.toLowerCase();
}

export function isoDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new BadRequest(`invalid_${field}`);
  }
  return value;
}

export function isoInstant(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > 40 || Number.isNaN(Date.parse(value))) throw new BadRequest(`invalid_${field}`);
  return new Date(value).toISOString();
}

export function int(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new BadRequest(`invalid_${field}`);
  return value;
}

export function bool(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new BadRequest(`invalid_${field}`);
  return value;
}

export function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) throw new BadRequest(`invalid_${field}`);
  return value.trim();
}

export function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return text(value, field, max);
}

export function clock(value: unknown, field: string): string {
  if (typeof value !== "string" || !TIME_RE.test(value)) throw new BadRequest(`invalid_${field}`);
  return value;
}

export function person(value: unknown, field: string): { region: Region; userId: string } {
  const v = value as { region?: unknown; userId?: unknown } | null;
  if (!v || typeof v.region !== "string" || !isRegion(v.region)) throw new BadRequest(`invalid_${field}`);
  return { region: v.region, userId: uuid(v.userId, field) };
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Actor and writer calls
// ---------------------------------------------------------------------------

export interface UserFacts {
  isAdmin: boolean;
  isTeacher: boolean;
  tz: string;
}

/** Role flags and timezone of any account, read from the region it lives in. Null when it has no
 * (live) users row. `tz` is the EFFECTIVE timezone (user_study_settings.timezone already follows the
 * person's manual choice when they made one); UTC only if the row is missing or empty. */
export async function readUserFacts(env: Env, region: Region, userId: string): Promise<UserFacts | null> {
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

export async function resolveActor(request: Request, env: Env, regionRaw: unknown): Promise<Actor | Response> {
  const identity = await resolveIdentity(request, env, typeof regionRaw === "string" ? regionRaw : null);
  if (identity instanceof Response) return identity;
  const facts = await readUserFacts(env, identity.region, identity.id);
  if (!facts) return json({ error: "account_unavailable" }, 403);
  const role: Role = facts.isAdmin ? "admin" : facts.isTeacher ? "teacher" : "student";
  return { id: identity.id, region: identity.region, role, isAdmin: facts.isAdmin, isTeacher: facts.isTeacher, tz: facts.tz };
}

export type WriterResult = { ok: true; data: unknown } | { ok: false; status: number; code: string; detail: string };

const NOT_FOUND = new Set(["class_not_found", "not_enrolled", "not_attending", "not_found", "not_an_occurrence"]);
const FORBIDDEN = new Set(["forbidden", "no_access"]);

function statusFor(code: string): number {
  if (FORBIDDEN.has(code)) return 403;
  if (NOT_FOUND.has(code)) return 404;
  if (code.startsWith("invalid_") || code === "date_in_past" || code === "reason_required") return 400;
  return 409; // class_full, quota_reached, already_*, same_class_twice, time_conflict, too_late, cannot_move, cancelled, ...
}

export async function callWriter(env: Env, fn: string, args: Record<string, unknown>): Promise<WriterResult> {
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

export function answer(result: WriterResult): Response {
  if (result.ok) return json(result.data ?? {});
  return json({ error: result.code, detail: result.detail || undefined }, result.status);
}

/** Runs a handler body, turning input errors into 400 and a missing key / unexpected failure into 5xx. */
export async function guarded(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof BadRequest) return json({ error: err.message }, 400);
    console.error("lessons handler failed:", err instanceof Error ? err.message : String(err));
    return json({ error: "server_error" }, 500);
  }
}

// ---------------------------------------------------------------------------
// Names and pictures: the writer knows people as (region, user id)
// ---------------------------------------------------------------------------

export interface Profile {
  display_name: string | null;
  avatar_url: string | null;
  is_teacher: boolean;
  email?: string | null;
}

export function profileKey(region: string, userId: string): string {
  return `${region}:${userId}`;
}

/** Names and pictures (and, for admins, emails) of people from the region each one lives in, one query
 * per 80 ids. A lookup that fails leaves those people out of the map: the page is still worth showing. */
export async function fetchProfiles(
  env: Env,
  refs: Array<{ region?: string | null; user_id?: string | null }>,
  opts: { email?: boolean } = {}
): Promise<Map<string, Profile>> {
  const idsByRegion = new Map<Region, Set<string>>();
  for (const ref of refs) {
    if (!ref.region || !isRegion(ref.region) || !ref.user_id || !UUID_RE.test(ref.user_id)) continue;
    if (!idsByRegion.has(ref.region)) idsByRegion.set(ref.region, new Set());
    idsByRegion.get(ref.region)!.add(ref.user_id);
  }

  const profiles = new Map<string, Profile>();
  const select = `id,display_name,avatar_url,is_teacher${opts.email ? ",email" : ""}`;
  await Promise.all(
    [...idsByRegion].map(async ([region, ids]) => {
      const list = [...ids];
      for (let i = 0; i < list.length; i += 80) {
        try {
          const rows = await pgSelectAll<Profile & { id: string }>(serviceConfig(env, region), "users", {
            id: `in.(${list.slice(i, i + 80).join(",")})`,
            select,
          });
          // Copy exactly what was asked for: the page must never receive more than the query meant to select.
          for (const row of rows) {
            profiles.set(profileKey(region, row.id), {
              display_name: row.display_name ?? null,
              avatar_url: row.avatar_url ?? null,
              is_teacher: row.is_teacher === true,
              ...(opts.email ? { email: row.email ?? null } : {}),
            });
          }
        } catch (err) {
          console.error(`lessons: profiles (${region}):`, err instanceof Error ? err.message : String(err));
        }
      }
    })
  );
  return profiles;
}

/** Plain-object form of a profile map, for JSON. */
export function profilesToObject(profiles: Map<string, Profile>): Record<string, Profile> {
  return Object.fromEntries(profiles);
}

// ---------------------------------------------------------------------------
// Who may do what
// ---------------------------------------------------------------------------

/** A student acting for themselves: the writer gets the verified region, id and timezone plus `args(body)`. */
export async function studentAction(
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

/** `staff` = admins and teachers; `admin` = admins only. */
export async function staffAction(
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

/** Same as staffAction, for GET requests (the region and the query come from the URL). */
export async function staffRead(
  request: Request,
  env: Env,
  url: URL,
  run: (actor: Actor) => Promise<Response>
): Promise<Response> {
  return guarded(async () => {
    const actor = await resolveActor(request, env, url.searchParams.get("region"));
    if (actor instanceof Response) return actor;
    if (!(actor.isAdmin || actor.isTeacher)) return json({ error: "forbidden" }, 403);
    return run(actor);
  });
}

/** A teacher must really be one: the flag is checked in the teacher's own region, not taken from the request. */
export async function requireTeacher(env: Env, teacher: { region: Region; userId: string }): Promise<Response | null> {
  const facts = await readUserFacts(env, teacher.region, teacher.userId);
  if (!facts) return json({ error: "teacher_not_found" }, 404);
  if (!facts.isTeacher) return json({ error: "not_a_teacher" }, 409);
  return null;
}

/** The class fields present in a request, as the column-named keys the writer's `p_changes` expects. */
export function classChanges(body: Record<string, unknown>): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  if (body.weekday !== undefined) changes.weekday = int(body.weekday, "weekday", 1, 7);
  if (body.startTime !== undefined) changes.start_time = clock(body.startTime, "startTime");
  if (body.durationMin !== undefined) changes.duration_min = int(body.durationMin, "durationMin", 10, 240);
  if (body.capacity !== undefined) changes.capacity = int(body.capacity, "capacity", 1, 3);
  if (body.title !== undefined) changes.title = text(body.title, "title", 80);
  if (body.levelLabel !== undefined) changes.level_label = optionalText(body.levelLabel, "levelLabel", 40);
  if (body.meetingUrl !== undefined) changes.meeting_url = optionalText(body.meetingUrl, "meetingUrl", 500);
  return changes;
}

/** The facts the writer needs about a student a staff member acts for; null (a 404 answer) when they
 * have no live account. */
export async function targetFacts(env: Env, target: { region: Region; userId: string }): Promise<UserFacts | Response> {
  const facts = await readUserFacts(env, target.region, target.userId);
  return facts ?? json({ error: "student_not_found" }, 404);
}

/** The arguments every staff RPC starts with. */
export function actorArgs(actor: Actor): Record<string, unknown> {
  return { p_actor_region: actor.region, p_actor_id: actor.id, p_actor_role: actor.role };
}
