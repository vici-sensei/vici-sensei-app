import type { Env } from "./env";
import { json } from "./http";
import { answer, BadRequest, callWriter, fetchProfiles, guarded, int, profileKey, readBody, resolveActor } from "./lessonsCommon";
import { syncGoogleCalendars } from "./googleCalendarCore";
import { deliverPush } from "./lessonsPush";
import { DEFAULT_FROM, sendMails, smtpSettings, type MailOutcome, type OutgoingMail } from "./mailer";

/**
 * Lesson notifications (docs/LESSON_BOOKING_PLAN.md, section 7), Worker side.
 *
 *  - The student's inbox and reminder switches: thin routes over the writer's RPCs.
 *  - The delivery job (runLessonNotifications, every 5 minutes): asks the writer to store what is due
 *    now (reminders, daylight-saving warnings), then takes the emails that are waiting, sends them in one
 *    SMTP session and tells the writer what happened to each. The writer leases what it hands out and
 *    retries what failed, so a crashed or overlapping run neither loses nor repeats an email.
 *
 * What to send, to whom and when is decided in the database; this file only looks up the address, writes
 * the email and delivers it.
 */

const APP_URL = "https://app.vici-sensei.com";
const BATCH_SIZE = 50;
const MAX_BATCHES = 3;

const REMINDER_KINDS = ["reminder_24h", "reminder_1h", "reminder_10m"];
const CHANNELS = ["inapp", "email", "push"];

// ---------------------------------------------------------------------------
// Student routes
// ---------------------------------------------------------------------------

function ids(value: unknown): number[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 100) throw new BadRequest("invalid_ids");
  return value.map((v) => int(v, "ids", 1, Number.MAX_SAFE_INTEGER));
}

function prefs(value: unknown): Array<{ kind: string; channel: string; enabled: boolean }> {
  if (!Array.isArray(value) || value.length > 20) throw new BadRequest("invalid_prefs");
  return value.map((entry) => {
    const e = entry as { kind?: unknown; channel?: unknown; enabled?: unknown } | null;
    if (!e || typeof e.kind !== "string" || !REMINDER_KINDS.includes(e.kind)) throw new BadRequest("invalid_prefs");
    if (typeof e.channel !== "string" || !CHANNELS.includes(e.channel)) throw new BadRequest("invalid_prefs");
    if (typeof e.enabled !== "boolean") throw new BadRequest("invalid_prefs");
    return { kind: e.kind, channel: e.channel, enabled: e.enabled };
  });
}

/** Handles /api/lessons/notifications* and /api/lessons/notification-prefs; null when it is not one of ours. */
export async function routeNotifications(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const get = request.method === "GET";
  const post = request.method === "POST";

  if (get && path === "/api/lessons/notifications") {
    return guarded(async () => {
      const actor = await resolveActor(request, env, url.searchParams.get("region"));
      if (actor instanceof Response) return actor;
      const limit = url.searchParams.get("limit");
      const before = url.searchParams.get("before");
      return answer(
        await callWriter(env, "lesson_notifications_list", {
          p_region: actor.region,
          p_user_id: actor.id,
          p_limit: limit === null ? 30 : int(Number(limit), "limit", 1, 100),
          p_before: before === null ? null : int(Number(before), "before", 1, Number.MAX_SAFE_INTEGER),
        })
      );
    });
  }

  if (post && path === "/api/lessons/notifications/read") {
    return guarded(async () => {
      const body = await readBody(request);
      const actor = await resolveActor(request, env, body.region);
      if (actor instanceof Response) return actor;
      return answer(await callWriter(env, "lesson_notifications_mark_read", { p_region: actor.region, p_user_id: actor.id, p_ids: ids(body.ids) }));
    });
  }

  if (get && path === "/api/lessons/notification-prefs") {
    return guarded(async () => {
      const actor = await resolveActor(request, env, url.searchParams.get("region"));
      if (actor instanceof Response) return actor;
      return answer(await callWriter(env, "lesson_notification_prefs_get", { p_region: actor.region, p_user_id: actor.id }));
    });
  }

  if (post && path === "/api/lessons/notification-prefs") {
    return guarded(async () => {
      const body = await readBody(request);
      const actor = await resolveActor(request, env, body.region);
      if (actor instanceof Response) return actor;
      if (actor.isTeacher) return json({ error: "teacher_cannot_book" }, 403);
      return answer(await callWriter(env, "lesson_notification_prefs_set", { p_region: actor.region, p_user_id: actor.id, p_prefs: prefs(body.prefs) }));
    });
  }

  return null;
}

// ---------------------------------------------------------------------------
// Delivery job
// ---------------------------------------------------------------------------

interface DueRow {
  id: number;
  region: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  attempts: number;
}

/** The email for one notification. The notification's own text is the message; the rest is a greeting,
 * a way back into the app and why they got it. */
export function renderEmail(row: Pick<DueRow, "kind" | "title" | "body">, displayName: string | null): { subject: string; text: string } {
  const first = displayName?.trim().split(/\s+/)[0];
  const reminder = row.kind.startsWith("reminder_");
  const footer = reminder
    ? "You can turn lesson reminders off, per reminder and per channel, in Lessons > Notifications."
    : "You get this email because you take lessons at Vici Sensei. Cancellations and changes to your lessons are always sent.";
  return {
    subject: row.title,
    text: [first ? `Hi ${first},` : "Hi,", "", row.body, "", `Open your lessons: ${APP_URL}/lessons`, "", footer].join("\n"),
  };
}

type Mark = "sent" | "skipped" | "retry" | "failed" | "release";

async function mark(env: Env, id: number, result: Mark, error?: string): Promise<void> {
  const res = await callWriter(env, "lesson_notification_mark", { p_id: id, p_channel: "email", p_result: result, p_error: error ?? null });
  if (!res.ok) console.error(`lessons mail: could not record ${result} for #${id}: ${res.code}`);
}

const MARK_FOR: Record<"permanent" | "retry" | "release", Mark> = { permanent: "failed", retry: "retry", release: "release" };

interface Totals {
  sent: number;
  failed: number;
  retry: number;
  released: number;
  skipped: number;
}

async function logRun(env: Env, totals: Totals): Promise<void> {
  if (totals.sent + totals.failed + totals.retry + totals.released + totals.skipped === 0) return;
  try {
    await env.ACCOUNTS_DB.prepare("INSERT INTO reconciliation_log (status, detail) VALUES (?1, ?2)")
      .bind(totals.failed + totals.retry + totals.released > 0 ? "lesson_mail_problems" : "lesson_mail", JSON.stringify(totals))
      .run();
  } catch (err) {
    console.error("lessons mail: could not write the log:", err instanceof Error ? err.message : String(err));
  }
}

/** One line in lessons.worker_runs (Postgres) saying how a run ended. The Worker's own logs are not kept
 * anywhere that can be queried, so this is how a job that silently does nothing becomes visible with plain
 * SQL. Never throws: if the writer cannot be reached the console line next to the call is all there is. */
async function note(env: Env, outcome: string, detail?: string): Promise<void> {
  try {
    await callWriter(env, "lesson_worker_note", { p_job: "lesson_mail", p_outcome: outcome, p_detail: detail ?? null });
  } catch {
    // no key / no connection: nothing more to do
  }
}

/** Runs from the 5-minute cron. Never throws. */
export async function runLessonNotifications(env: Env): Promise<void> {
  try {
    await deliver(env);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("lessons mail: run failed:", message);
    await note(env, "run_failed", message);
  }
  // The students' Google calendars ride on the same 5-minute job (googleCalendar.ts; never throws).
  await syncGoogleCalendars(env);
}

async function deliver(env: Env): Promise<void> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY_EU) {
    // Nothing can run before the writer's key is set (and nothing can be noted in Postgres either).
    console.error("lessons mail: SUPABASE_SERVICE_ROLE_KEY_EU is not set, the job does nothing");
    return;
  }

  // pg_cron does this every minute where it exists; doing it here as well is free (the stored rows are
  // deduplicated) and covers a project where the schedule is missing.
  const tick = await callWriter(env, "lesson_scheduler_tick", {});
  if (!tick.ok) {
    console.error(`lessons mail: scheduler tick failed: ${tick.code}`);
    await note(env, "tick_failed", tick.code);
    return;
  }

  const settings = smtpSettings(env);
  if (!settings) {
    // The in-app copies exist; emails wait until SMTP_USER / SMTP_PASSWORD are set. Push does not need them.
    await note(env, "no_smtp_settings");
    await deliverPush(env);
    return;
  }

  const totals: Totals = { sent: 0, failed: 0, retry: 0, released: 0, skipped: 0 };
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const due = await callWriter(env, "lesson_notifications_due", { p_limit: BATCH_SIZE });
    if (!due.ok) {
      console.error(`lessons mail: could not read the queue: ${due.code}`);
      await note(env, "queue_unreadable", due.code);
      break;
    }
    const rows = (Array.isArray(due.data) ? due.data : []) as DueRow[];
    if (rows.length === 0) break;

    const profiles = await fetchProfiles(env, rows, { email: true });
    const mails: OutgoingMail[] = [];
    const sending: DueRow[] = [];
    for (const row of rows) {
      const profile = profiles.get(profileKey(row.region, row.user_id));
      if (!profile) {
        // Either the account is gone or the lookup failed; both are settled by trying again later.
        totals.retry += 1;
        await mark(env, row.id, "retry", "no profile found");
        continue;
      }
      if (!profile.email) {
        totals.skipped += 1;
        await mark(env, row.id, "skipped", "no email address");
        continue;
      }
      const { subject, text } = renderEmail(row, profile.display_name);
      mails.push({ from: DEFAULT_FROM, to: profile.email, subject, text, automatic: true });
      sending.push(row);
    }

    let outcomes: MailOutcome[] = [];
    if (mails.length > 0) outcomes = await sendMails(settings, mails);

    let released = false;
    for (let i = 0; i < sending.length; i += 1) {
      const outcome = outcomes[i];
      if (outcome.ok) {
        totals.sent += 1;
        await mark(env, sending[i].id, "sent");
      } else {
        if (outcome.kind === "permanent") totals.failed += 1;
        else if (outcome.kind === "retry") totals.retry += 1;
        else {
          totals.released += 1;
          released = true;
        }
        await mark(env, sending[i].id, MARK_FOR[outcome.kind], outcome.error);
      }
    }
    if (released || rows.length < BATCH_SIZE) break; // the mail server is not reachable / the queue is drained
  }
  await logRun(env, totals);
  console.log("lessons mail: run", JSON.stringify(totals));
  await note(env, "ok", JSON.stringify(totals));
  await deliverPush(env);
}
