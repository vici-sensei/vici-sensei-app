import type { Env } from "./env";
import { callWriter } from "./lessonsWriter";
import { b64urlEncode } from "./webPush";

/**
 * Lessons in the student's Google Calendar (docs/LESSON_BOOKING_PLAN.md, section 9).
 *
 * The calendar belongs to the APP: a Google service account owns one calendar per student and shares it with
 * the student's Gmail read-only, so they can see the lessons but cannot edit or delete them. The app writes the
 * events itself, so a change (a cancellation, a move, a new time) is in the calendar within minutes, as
 * individual events (not a recurring series: each lesson can be cancelled or moved on its own, and the
 * daylight-saving shifts take care of themselves because every event has its own instant).
 *
 * The writer keeps the book-keeping (which calendar, which event stands for which lesson, what changed since
 * the last sync); this file talks to Google. Needs one secret: GOOGLE_SERVICE_ACCOUNT_JSON, the service
 * account's JSON key. Without it everything here is switched off and the page hides the option.
 *
 * This file is everything that does not need a request (the sync job, the deletion); the routes the student
 * uses are in googleCalendar.ts. Kept apart so lessonsAccounts.ts (called by the region move) can delete a
 * calendar without an import cycle.
 */

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/calendar";
const APP_URL = "https://app.vici-sensei.com/lessons";

/** Google calls in one run of the 5-minute job (Workers allow 50 subrequests on the free plan, and the other
 * jobs of the same run need a few), and the most one student may take of them. */
const RUN_BUDGET = 36;
const STUDENT_BUDGET = 30;
const STUDENTS_PER_RUN = 3;

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export function googleAccount(env: Env): ServiceAccount | null {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) return null;
  try {
    const key = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as Partial<ServiceAccount>;
    return key.client_email && key.private_key ? { client_email: key.client_email, private_key: key.private_key } : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Authentication: a service account signs a JWT and trades it for an access token (1 hour)
// ---------------------------------------------------------------------------

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(body);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

let cachedToken: { token: string; expiresAt: number; account: string } | null = null;

async function accessToken(account: ServiceAccount, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  if (cachedToken && cachedToken.account === account.client_email && cachedToken.expiresAt - 60 > nowSeconds) return cachedToken.token;
  const enc = new TextEncoder();
  const header = b64urlEncode(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 })));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${header}.${claims}`)));
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${b64urlEncode(signature)}` }),
  });
  if (!res.ok) throw new GoogleError(res.status, "token", `Google refused the service account (HTTP ${res.status})`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new GoogleError(502, "token", "Google sent no access token");
  cachedToken = { token: body.access_token, expiresAt: nowSeconds + (body.expires_in ?? 3600), account: account.client_email };
  return body.access_token;
}

export class GoogleError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    message: string
  ) {
    super(message);
  }
  /** Google asks us to slow down: stop for this run. */
  get rateLimited(): boolean {
    return this.status === 429 || (this.status === 403 && /rate|quota/i.test(this.reason));
  }
}

/** One Calendar API call; counts against `budget` and throws GoogleError on any HTTP error. 204 and 404 on a
 * delete are "already gone", not errors. */
export class Api {
  calls = 0;
  constructor(
    private readonly account: ServiceAccount,
    private readonly limit: number
  ) {}

  get left(): number {
    return this.limit - this.calls;
  }

  async call(method: string, path: string, body?: unknown, opts: { allow404?: boolean } = {}): Promise<unknown> {
    if (this.left <= 0) throw new GoogleError(429, "budget", "no Google calls left in this run");
    this.calls += 1;
    const send = async (token: string) =>
      fetch(`${CALENDAR_API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let res = await send(await accessToken(this.account));
    if (res.status === 401) {
      cachedToken = null; // the token was refused: get a new one once
      res = await send(await accessToken(this.account));
    }
    if (res.status === 404 && opts.allow404) return null;
    if (res.status === 410 && method === "DELETE") return null;
    if (!res.ok) {
      let reason = "";
      try {
        const e = (await res.json()) as { error?: { errors?: Array<{ reason?: string }>; message?: string } };
        reason = e.error?.errors?.[0]?.reason ?? e.error?.message ?? "";
      } catch {
        // not JSON
      }
      throw new GoogleError(res.status, reason, `Google Calendar ${method} ${path.split("?")[0].replace(/\/[^/]+(@|%40)[^/]+/, "/<calendar>")}: HTTP ${res.status} ${reason}`.trim());
    }
    return res.status === 204 ? null : res.json();
  }
}

// ---------------------------------------------------------------------------
// Calendars and events
// ---------------------------------------------------------------------------

export async function createCalendar(api: Api, email: string): Promise<string> {
  const created = (await api.call("POST", "/calendars", { summary: "Vici Sensei lessons", description: "Your Japanese lessons. Managed by Vici Sensei: it updates by itself.", timeZone: "UTC" })) as { id: string };
  // Read-only: the student can see the lessons but not change them. Google emails them the invitation.
  await api.call("POST", `/calendars/${encodeURIComponent(created.id)}/acl?sendNotifications=true`, { role: "reader", scope: { type: "user", value: email } });
  return created.id;
}

export function calendarLink(calendarId: string): string {
  return `https://calendar.google.com/calendar/u/0?cid=${btoa(calendarId).replace(/=+$/, "")}`;
}

interface PlannedEvent {
  class_id: string;
  ny_date: string;
  starts_at: string;
  ends_at: string;
  title: string;
  level: string | null;
  meeting_url: string | null;
  hash: string;
}

interface ExistingEvent {
  class_id: string;
  ny_date: string;
  event_id: string;
  hash: string;
  ends_at: string;
}

export function eventBody(e: PlannedEvent) {
  const lines = [e.level ? `Level: ${e.level}` : null, e.meeting_url ? `Join: ${e.meeting_url}` : null, "The class keeps its New York time; your calendar shows it in your own time zone."];
  return {
    summary: e.level ? `${e.title} (${e.level})` : e.title,
    description: lines.filter(Boolean).join("\n"),
    location: e.meeting_url ?? undefined,
    start: { dateTime: new Date(e.starts_at).toISOString(), timeZone: "UTC" },
    end: { dateTime: new Date(e.ends_at).toISOString(), timeZone: "UTC" },
    source: { title: "Vici Sensei", url: APP_URL },
    guestsCanModify: false,
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] },
  };
}

const keyOf = (e: { class_id: string; ny_date: string }) => `${e.class_id}|${e.ny_date}`;

interface DueCalendar {
  region: string;
  user_id: string;
  calendar_id: string | null;
  shared_with: string | null;
  seq: number;
  events: PlannedEvent[];
  existing: ExistingEvent[];
}

/** Makes one student's calendar show what it should: creates the calendar if it does not exist, then adds,
 * changes and removes events. Returns what was done for the writer's book-keeping. Stops (throwing) when
 * Google pushes back. */
async function syncOne(api: Api, due: DueCalendar): Promise<{ upserts: unknown[]; deleted: unknown[]; calendarId: string | null; error: string | null }> {
  const upserts: unknown[] = [];
  const deleted: unknown[] = [];
  let calendarId = due.calendar_id;
  const spent = api.calls;
  const room = () => api.calls - spent < STUDENT_BUDGET;
  try {
    if (!calendarId) {
      if (!due.shared_with) return { upserts, deleted, calendarId, error: "no address to share the calendar with" };
      calendarId = await createCalendar(api, due.shared_with);
    }
    const cal = encodeURIComponent(calendarId);
    const have = new Map(due.existing.map((e) => [keyOf(e), e]));
    const want = new Map(due.events.map((e) => [keyOf(e), e]));

    for (const [key, e] of want) {
      const old = have.get(key);
      if (old && old.hash === e.hash) continue;
      if (!room()) return { upserts, deleted, calendarId, error: "more to do: continued in the next run" };
      if (old) {
        // A 404 means someone removed the event in Google: put it back.
        const patched = await api.call("PATCH", `/calendars/${cal}/events/${encodeURIComponent(old.event_id)}`, eventBody(e), { allow404: true });
        if (patched) {
          upserts.push({ class_id: e.class_id, ny_date: e.ny_date, event_id: old.event_id, hash: e.hash, ends_at: e.ends_at });
          continue;
        }
      }
      const made = (await api.call("POST", `/calendars/${cal}/events`, eventBody(e))) as { id: string };
      upserts.push({ class_id: e.class_id, ny_date: e.ny_date, event_id: made.id, hash: e.hash, ends_at: e.ends_at });
    }
    for (const [key, old] of have) {
      if (want.has(key)) continue;
      if (!room()) return { upserts, deleted, calendarId, error: "more to do: continued in the next run" };
      await api.call("DELETE", `/calendars/${cal}/events/${encodeURIComponent(old.event_id)}`, undefined, { allow404: true });
      deleted.push({ class_id: old.class_id, ny_date: old.ny_date });
    }
    return { upserts, deleted, calendarId, error: null };
  } catch (err) {
    if (err instanceof GoogleError && err.rateLimited) throw Object.assign(err, { partial: { upserts, deleted, calendarId } });
    return { upserts, deleted, calendarId, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Runs from the 5-minute job. Never throws. */
export async function syncGoogleCalendars(env: Env): Promise<void> {
  const account = googleAccount(env);
  if (!account) return;
  try {
    const due = await callWriter(env, "lesson_google_due", { p_limit: STUDENTS_PER_RUN });
    if (!due.ok) {
      console.error(`google calendar: could not read the queue: ${due.code}`);
      return;
    }
    const api = new Api(account, RUN_BUDGET);
    for (const item of (Array.isArray(due.data) ? due.data : []) as DueCalendar[]) {
      let result: Awaited<ReturnType<typeof syncOne>>;
      let stop = false;
      try {
        result = await syncOne(api, item);
      } catch (err) {
        const partial = (err as { partial?: { upserts: unknown[]; deleted: unknown[]; calendarId: string | null } }).partial;
        result = { upserts: partial?.upserts ?? [], deleted: partial?.deleted ?? [], calendarId: partial?.calendarId ?? item.calendar_id, error: err instanceof Error ? err.message : String(err) };
        stop = true; // Google asked us to slow down: the other students wait for the next run
      }
      if (result.calendarId && result.calendarId !== item.calendar_id) {
        await callWriter(env, "lesson_google_set_calendar", { p_region: item.region, p_user_id: item.user_id, p_calendar_id: result.calendarId });
      }
      const done = await callWriter(env, "lesson_google_done", {
        p_region: item.region,
        p_user_id: item.user_id,
        p_seq: item.seq,
        p_upserts: result.upserts,
        p_deleted: result.deleted,
        p_error: result.error,
      });
      if (!done.ok) console.error(`google calendar: could not record the sync of ${item.user_id}: ${done.code}`);
      if (result.error && !result.error.startsWith("more to do")) console.error(`google calendar: ${item.user_id}: ${result.error}`);
      if (stop) break;
    }
  } catch (err) {
    console.error("google calendar: run failed:", err instanceof Error ? err.message : String(err));
  }
}

/** Deletes a student's calendar in Google (their events go with it) and forgets it in the writer. Used when they
 * switch the feature off and when their account is deleted. Throws on a Google error other than "not found". */
export async function releaseGoogleCalendar(env: Env, region: string, userId: string): Promise<boolean> {
  const state = await callWriter(env, "lesson_google_state", { p_region: region, p_user_id: userId });
  const calendarId = state.ok ? (state.data as { calendar_id?: string | null }).calendar_id : null;
  if (!calendarId) return false;
  const account = googleAccount(env);
  if (!account) throw new Error("Google Calendar is not configured, so the student's calendar cannot be deleted");
  await new Api(account, 3).call("DELETE", `/calendars/${encodeURIComponent(calendarId)}`, undefined, { allow404: true });
  await callWriter(env, "lesson_google_forget", { p_region: region, p_user_id: userId });
  return true;
}
