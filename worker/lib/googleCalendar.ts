import type { Env } from "./env";
import { json } from "./http";
import { Api, createCalendar, calendarLink, googleAccount, releaseGoogleCalendar } from "./googleCalendarCore";
import { answer, callWriter, fetchProfiles, guarded, profileKey, readBody, resolveActor } from "./lessonsCommon";

/** The routes with which a student switches their Google calendar on and off (the sync itself is in
 * googleCalendarCore.ts). */

// Routes: the student switches it on and off
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

interface GoogleState {
  enabled: boolean;
  calendar_id: string | null;
  shared_with: string | null;
  synced_at: string | null;
  last_error: string | null;
  events: number;
}

function present(state: GoogleState) {
  return { configured: true, ...state, calendar_link: state.calendar_id ? calendarLink(state.calendar_id) : null };
}

/** Handles /api/lessons/google*; null when the request is not one of ours. */
export async function routeGoogle(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const get = request.method === "GET";
  const post = request.method === "POST";

  if (get && path === "/api/lessons/google") {
    return guarded(async () => {
      const actor = await resolveActor(request, env, url.searchParams.get("region"));
      if (actor instanceof Response) return actor;
      if (actor.isTeacher) return json({ error: "teacher_cannot_book" }, 403);
      if (!googleAccount(env)) return json({ configured: false });
      const state = await callWriter(env, "lesson_google_state", { p_region: actor.region, p_user_id: actor.id });
      return state.ok ? json(present(state.data as GoogleState)) : answer(state);
    });
  }

  if (post && path === "/api/lessons/google/enable") {
    return guarded(async () => {
      const body = await readBody(request);
      const actor = await resolveActor(request, env, body.region);
      if (actor instanceof Response) return actor;
      if (actor.isTeacher) return json({ error: "teacher_cannot_book" }, 403);
      const account = googleAccount(env);
      if (!account) return json({ error: "google_not_configured" }, 503);
      // The calendar is shared with the address of the account itself (every account is a Gmail address).
      const profiles = await fetchProfiles(env, [{ region: actor.region, user_id: actor.id }], { email: true });
      const email = profiles.get(profileKey(actor.region, actor.id))?.email;
      if (!email) return json({ error: "no_email" }, 409);
      const set = await callWriter(env, "lesson_google_set", { p_region: actor.region, p_user_id: actor.id, p_enabled: true, p_email: email });
      if (!set.ok) return answer(set);
      let state = set.data as GoogleState;
      // Try to make the calendar right now, so the student sees the invitation at once. If Google is not
      // reachable the 5-minute job makes it later (the request is saved either way).
      if (!state.calendar_id) {
        try {
          const calendarId = await createCalendar(new Api(account, 3), email);
          const stored = await callWriter(env, "lesson_google_set_calendar", { p_region: actor.region, p_user_id: actor.id, p_calendar_id: calendarId });
          if (stored.ok) state = stored.data as GoogleState;
        } catch (err) {
          console.error("google calendar: enable:", err instanceof Error ? err.message : String(err));
        }
      }
      return json(present(state));
    });
  }

  if (post && path === "/api/lessons/google/disable") {
    return guarded(async () => {
      const body = await readBody(request);
      const actor = await resolveActor(request, env, body.region);
      if (actor instanceof Response) return actor;
      if (actor.isTeacher) return json({ error: "teacher_cannot_book" }, 403);
      if (!googleAccount(env)) return json({ error: "google_not_configured" }, 503);
      // Stop syncing first; then delete the calendar. If Google is down the calendar stays (and is reused
      // if they switch it on again) and the student is told to try again.
      const off = await callWriter(env, "lesson_google_set", { p_region: actor.region, p_user_id: actor.id, p_enabled: false });
      if (!off.ok) return answer(off);
      try {
        await releaseGoogleCalendar(env, actor.region, actor.id);
      } catch (err) {
        console.error("google calendar: disable:", err instanceof Error ? err.message : String(err));
        return json({ error: "google_error" }, 502);
      }
      const state = await callWriter(env, "lesson_google_state", { p_region: actor.region, p_user_id: actor.id });
      return state.ok ? json(present(state.data as GoogleState)) : answer(state);
    });
  }

  return null;
}
