import type { Env } from "./env";
import { json } from "./http";
import {
  BadRequest,
  answer,
  callWriter,
  guarded,
  int,
  isoDate,
  readBody,
  resolveActor,
  studentAction,
  uuid,
} from "./lessonsCommon";

/**
 * The student's waitlist (docs/LESSON_BOOKING_PLAN.md, section 5): ask to be told when a full class, or a
 * full lesson for one week, gets a seat. The writer decides when a seat is free and tells everybody
 * waiting; whoever confirms first gets it (lesson_waitlist_confirm runs the normal booking code, so the
 * limits are checked again). The staff's view of the same list is in lessonsStaff.ts.
 */

const MAX_ID = Number.MAX_SAFE_INTEGER;

function optionalUuid(value: unknown, field: string): string | null {
  return value === undefined || value === null ? null : uuid(value, field);
}

/** An optional "lesson to give up" pair (class + template date); both or neither. */
function swapOf(body: Record<string, unknown>): { p_swap_class: string | null; p_swap_date: string | null } {
  const hasClass = body.swapClassId !== undefined && body.swapClassId !== null;
  const hasDate = body.swapDate !== undefined && body.swapDate !== null;
  if (hasClass !== hasDate) throw new BadRequest("invalid_swap");
  return {
    p_swap_class: hasClass ? uuid(body.swapClassId, "swapClassId") : null,
    p_swap_date: hasDate ? isoDate(body.swapDate, "swapDate") : null,
  };
}

/** A read or a write that takes no timezone: the caller's own region and id are all the writer needs. */
async function plain(request: Request, env: Env, fn: string, regionRaw: (body: Record<string, unknown>) => unknown, extra: (body: Record<string, unknown>) => Record<string, unknown>) {
  return guarded(async () => {
    const body = request.method === "POST" ? await readBody(request) : {};
    const actor = await resolveActor(request, env, regionRaw(body));
    if (actor instanceof Response) return actor;
    if (actor.isTeacher) return json({ error: "teacher_cannot_book" }, 403);
    return answer(await callWriter(env, fn, { p_region: actor.region, p_user_id: actor.id, ...extra(body) }));
  });
}

/** Handles /api/lessons/waitlist*; null when the request is not one of ours. */
export async function routeWaitlist(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const get = request.method === "GET";
  const post = request.method === "POST";

  if (get && path === "/api/lessons/waitlist") {
    return plain(request, env, "lesson_waitlist_list", () => url.searchParams.get("region"), () => ({}));
  }

  if (post && path === "/api/lessons/waitlist/join") {
    return studentAction(request, env, "lesson_waitlist_join", (b) => {
      if (b.kind !== "fixed" && b.kind !== "once") throw new BadRequest("invalid_kind");
      return {
        p_class_id: uuid(b.classId, "classId"),
        p_kind: b.kind,
        p_ny_date: b.kind === "once" ? isoDate(b.nyDate, "nyDate") : null,
        p_replace_class: b.kind === "fixed" ? optionalUuid(b.replaceClassId, "replaceClassId") : null,
        ...(b.kind === "once" ? swapOf(b) : { p_swap_class: null, p_swap_date: null }),
      };
    });
  }

  if (post && path === "/api/lessons/waitlist/leave") {
    return plain(request, env, "lesson_waitlist_leave", (b) => b.region, (b) => ({ p_entry_id: int(b.id, "id", 1, MAX_ID) }));
  }

  if (post && path === "/api/lessons/waitlist/confirm") {
    return studentAction(request, env, "lesson_waitlist_confirm", (b) => ({
      p_entry_id: int(b.id, "id", 1, MAX_ID),
      p_replace_class: optionalUuid(b.replaceClassId, "replaceClassId"),
      ...swapOf(b),
    }));
  }

  return null;
}
