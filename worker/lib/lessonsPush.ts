import type { Env } from "./env";
import { json } from "./http";
import { BadRequest, answer, callWriter, guarded, readBody, resolveActor } from "./lessonsCommon";
import { b64urlDecode, isPushEndpoint, sendWebPush, type Device, type PushOutcome, type Vapid } from "./webPush";

/**
 * Web push for lesson notifications (docs/LESSON_BOOKING_PLAN.md, section 7).
 *
 *  - Routes: a student turns push on or off for the device they are using, and asks whether it is on.
 *    The browser needs the server's public key to subscribe, so the Worker hands it out
 *    (GET /api/lessons/push/config: null while VAPID is not configured, and the page then hides the switch).
 *  - Delivery (deliverPush, called by the 5-minute job in lessonsNotify.ts): takes the pushes that are due
 *    from the writer, sends each to every device of that student and reports the result. A device the push
 *    service says is gone is deleted by the writer.
 *
 * Needs three settings, all set by the owner: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (a secret) and
 * VAPID_SUBJECT ("mailto:..."). Make the pair with `node scripts/generate-vapid-keys.mjs`.
 */

const BATCH_SIZE = 50;
const MAX_BATCHES = 3;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function vapidFrom(env: Env): Vapid | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return null;
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

function endpointOf(value: unknown): string {
  if (typeof value !== "string" || !isPushEndpoint(value) || value.length > 1000) throw new BadRequest("invalid_endpoint");
  return value;
}

function keyOf(value: unknown, field: string, bytes: number, firstByte?: number): string {
  if (typeof value !== "string" || !BASE64URL.test(value) || value.length > 120) throw new BadRequest(`invalid_${field}`);
  let raw: Uint8Array;
  try {
    raw = b64urlDecode(value);
  } catch {
    throw new BadRequest(`invalid_${field}`); // not valid base64
  }
  if (raw.length !== bytes || (firstByte !== undefined && raw[0] !== firstByte)) throw new BadRequest(`invalid_${field}`);
  return value;
}

/** Handles /api/lessons/push/*; null when the request is not one of ours. */
export async function routePush(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const get = request.method === "GET";
  const post = request.method === "POST";

  if (get && path === "/api/lessons/push/config") {
    return guarded(async () => {
      const actor = await resolveActor(request, env, url.searchParams.get("region"));
      if (actor instanceof Response) return actor;
      return json({ publicKey: vapidFrom(env)?.publicKey ?? null });
    });
  }

  if (get && path === "/api/lessons/push/state") {
    return guarded(async () => {
      const actor = await resolveActor(request, env, url.searchParams.get("region"));
      if (actor instanceof Response) return actor;
      if (actor.isTeacher) return json({ error: "teacher_cannot_book" }, 403);
      const endpoint = url.searchParams.get("endpoint");
      return answer(
        await callWriter(env, "lesson_push_state", { p_region: actor.region, p_user_id: actor.id, p_endpoint: endpoint && isPushEndpoint(endpoint) ? endpoint : null })
      );
    });
  }

  if (post && path === "/api/lessons/push/subscribe") {
    return guarded(async () => {
      const body = await readBody(request);
      const actor = await resolveActor(request, env, body.region);
      if (actor instanceof Response) return actor;
      if (actor.isTeacher) return json({ error: "teacher_cannot_book" }, 403);
      if (!vapidFrom(env)) return json({ error: "push_not_configured" }, 503);
      return answer(
        await callWriter(env, "lesson_push_subscribe", {
          p_region: actor.region,
          p_user_id: actor.id,
          p_endpoint: endpointOf(body.endpoint),
          p_p256dh: keyOf(body.p256dh, "p256dh", 65, 0x04),
          p_auth: keyOf(body.auth, "auth", 16),
          p_user_agent: request.headers.get("User-Agent")?.slice(0, 300) ?? null,
        })
      );
    });
  }

  if (post && path === "/api/lessons/push/unsubscribe") {
    return guarded(async () => {
      const body = await readBody(request);
      const actor = await resolveActor(request, env, body.region);
      if (actor instanceof Response) return actor;
      return answer(await callWriter(env, "lesson_push_unsubscribe", { p_region: actor.region, p_user_id: actor.id, p_endpoint: endpointOf(body.endpoint) }));
    });
  }

  return null;
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

interface DuePush {
  id: number;
  kind: string;
  title: string;
  body: string;
  devices: Device[];
}

/** What the service worker shows. The body is cut so the encrypted message always fits in one push. */
export function pushMessage(row: Pick<DuePush, "id" | "kind" | "title" | "body">) {
  return { title: row.title.slice(0, 120), body: row.body.slice(0, 400), url: "/lessons", tag: `lesson-${row.kind}`, kind: row.kind, id: row.id };
}

/** How long a push service may hold the message for a device that is offline, and how urgent it is. */
function deliveryTerms(kind: string): { ttlSeconds: number; urgency: "normal" | "high" } {
  if (kind === "reminder_10m") return { ttlSeconds: 600, urgency: "high" };
  if (kind === "reminder_1h") return { ttlSeconds: 3600, urgency: "high" };
  if (kind === "waitlist_seat") return { ttlSeconds: 4 * 3600, urgency: "high" };
  if (kind.startsWith("reminder_")) return { ttlSeconds: 6 * 3600, urgency: "normal" };
  return { ttlSeconds: 24 * 3600, urgency: "normal" };
}

/** One notification, every device. sent if any device took it; otherwise retry if anything may work later,
 * failed if every device refused for good, skipped if every device was gone. */
export function settle(outcomes: PushOutcome[]): { result: "sent" | "retry" | "failed" | "skipped"; error: string | null } {
  if (outcomes.some((o) => o.kind === "ok")) return { result: "sent", error: null };
  const problem = outcomes.find((o) => o.kind === "retry") ?? outcomes.find((o) => o.kind === "failed");
  if (problem) return { result: problem.kind === "retry" ? "retry" : "failed", error: problem.error ?? null };
  return { result: "skipped", error: "no device left" };
}

export async function deliverPush(env: Env): Promise<void> {
  const vapid = vapidFrom(env);
  if (!vapid) return; // nothing is pushed before the keys exist; the notices wait in the queue
  const totals = { sent: 0, retry: 0, failed: 0, skipped: 0, gone: 0 };

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const due = await callWriter(env, "lesson_push_due", { p_limit: BATCH_SIZE });
    if (!due.ok) {
      console.error(`lessons push: could not read the queue: ${due.code}`);
      break;
    }
    const rows = (Array.isArray(due.data) ? due.data : []) as DuePush[];
    if (rows.length === 0) break;

    for (const row of rows) {
      const terms = deliveryTerms(row.kind);
      const message = pushMessage(row);
      const outcomes = await Promise.all(
        row.devices.map((device) => sendWebPush(device, message, vapid, { ...terms, topic: `lesson-${row.kind}`.slice(0, 32) }))
      );
      const gone = row.devices.filter((_, i) => outcomes[i].kind === "gone").map((d) => d.endpoint);
      totals.gone += gone.length;
      const { result, error } = settle(outcomes);
      totals[result] += 1;
      const mark = await callWriter(env, "lesson_push_mark", { p_id: row.id, p_result: result, p_error: error, p_gone: gone.length ? gone : null });
      if (!mark.ok) console.error(`lessons push: could not record ${result} for #${row.id}: ${mark.code}`);
    }
    if (rows.length < BATCH_SIZE) break;
  }

  if (totals.sent + totals.retry + totals.failed + totals.skipped + totals.gone > 0) {
    try {
      await env.ACCOUNTS_DB.prepare("INSERT INTO reconciliation_log (status, detail) VALUES (?1, ?2)")
        .bind(totals.retry + totals.failed > 0 ? "lesson_push_problems" : "lesson_push", JSON.stringify(totals))
        .run();
    } catch (err) {
      console.error("lessons push: could not write the log:", err instanceof Error ? err.message : String(err));
    }
  }
}
