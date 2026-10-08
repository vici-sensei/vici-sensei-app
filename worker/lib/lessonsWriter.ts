import type { Env } from "./env";
import type { Region } from "./region";
import { serviceAuthHeaders, serviceConfig } from "./supabaseAdmin";

/**
 * The one door to the lesson writer (schema `lessons` on the writer's project): a service_role RPC call whose
 * errors come back as `lesson:<code>` and are mapped to an HTTP status. Kept apart from lessonsCommon.ts so the
 * region move (regionMove.ts, which lessonsCommon itself imports) can call the writer without an import cycle.
 */

/** The region whose database holds the `lessons` schema (the single writer for seats). Moving it is a
 * migration plus changing this constant -- see the plan, section 2. */
export const WRITER_REGION: Region = "eu";

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
