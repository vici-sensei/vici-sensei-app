import { type Env, projectConfig } from "./lib/env";
import { emailKey, isRegion, regionFromCfContinent, type Region } from "./lib/region";
import { handleRegionMoveContinue, handleRegionMoveStart, handleRegionMoveStatus } from "./lib/regionMove";
import { verifyStandardWebhook } from "./lib/webhooks";

export type { Env };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** GET /api/geo -- geo-IP region guess for the login page's region selector (Phase 7). No email
 * involved, nothing to look up: this is the ONLY public endpoint, by design (Decision 3 forbids
 * a public email-lookup endpoint, and this isn't one). */
function handleGeo(request: Request): Response {
  return json({ region: regionFromCfContinent(request.cf?.continent) });
}

/**
 * POST /api/auth-hook/:region/claim -- the "Before User Created" HTTP hook target (Decision 3).
 * `:region` says which project is calling (each project's Dashboard hook config points at its
 * own URL/secret), NOT which region the signup belongs to -- that's decided here, atomically, by
 * whichever project's hook asks first for a given email. Fails closed: any error (bad
 * signature, malformed payload, D1 failure) denies the signup rather than allowing it.
 */
async function handleAuthHookClaim(request: Request, env: Env, region: Region): Promise<Response> {
  const secret = region === "eu" ? env.AUTH_HOOK_SECRET_EU : env.AUTH_HOOK_SECRET_US;
  if (!secret) {
    return json({ error: { http_code: 500, message: "hook_not_configured" } });
  }

  const rawBody = await request.text();
  const verification = await verifyStandardWebhook(secret, rawBody, request.headers);
  if (!verification.ok) {
    return json({ error: { http_code: 401, message: `invalid_signature:${verification.reason}` } });
  }

  let email: unknown;
  try {
    const payload = JSON.parse(rawBody) as { user?: { email?: unknown } };
    email = payload.user?.email;
  } catch {
    return json({ error: { http_code: 400, message: "invalid_payload" } });
  }
  if (typeof email !== "string" || !email.includes("@")) {
    return json({ error: { http_code: 400, message: "invalid_payload" } });
  }

  const key = emailKey(email);
  try {
    await env.ACCOUNTS_DB.prepare(
      "INSERT INTO accounts (email_key, region) VALUES (?1, ?2) ON CONFLICT(email_key) DO NOTHING"
    )
      .bind(key, region)
      .run();
    const claimed = await env.ACCOUNTS_DB.prepare("SELECT region FROM accounts WHERE email_key = ?1")
      .bind(key)
      .first<{ region: Region }>();

    if (!claimed) {
      // Shouldn't happen (the INSERT above guarantees a row exists) -- fail closed anyway.
      return json({ error: { http_code: 500, message: "claim_failed" } });
    }
    if (claimed.region !== region) {
      return json({ error: { http_code: 400, message: `wrong_region:${claimed.region}` } });
    }
    return json({});
  } catch {
    return json({ error: { http_code: 500, message: "claim_failed" } });
  }
}

// Consecutive daily keep-alive failures that trigger a flag row in `reconciliation_log`. No
// outbound alert channel exists (explicit user choice) -- this only makes a sustained outage
// easy to spot when someone looks at D1, instead of having to scroll `keepalive_log` by hand.
const KEEPALIVE_ALERT_THRESHOLD = 3;

async function runKeepalive(env: Env): Promise<void> {
  for (const region of ["eu", "us"] as const) {
    const { url, anonKey } = projectConfig(env, region);
    let ok = false;
    let statusCode: number | null = null;
    let error: string | null = null;
    try {
      // GoTrue's dedicated health check -- bare `/rest/v1/` needs the service_role key (it's the
      // OpenAPI introspection root, confirmed by hand against both new projects), so it's not a
      // usable "is this project alive" probe for an anon-key-only Worker.
      const response = await fetch(new URL("auth/v1/health", url), { headers: { apikey: anonKey } });
      statusCode = response.status;
      ok = response.ok;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    await env.ACCOUNTS_DB.prepare(
      "INSERT INTO keepalive_log (region, ok, status_code, error) VALUES (?1, ?2, ?3, ?4)"
    )
      .bind(region, ok ? 1 : 0, statusCode, error)
      .run();

    if (!ok) await flagIfConsecutiveFailures(env, region);
  }
}

/** Fires exactly once per outage, the day the failure streak first reaches the threshold -- not
 * on every subsequent day it keeps failing (that would just be daily-repeated noise in the same
 * log a human has to scroll through, same problem this is meant to solve). Detects "first day at
 * threshold" by checking that the run just before the streak either doesn't exist or wasn't
 * itself a failure. */
async function flagIfConsecutiveFailures(env: Env, region: Region): Promise<void> {
  const recent = await env.ACCOUNTS_DB.prepare(
    "SELECT ok, checked_at FROM keepalive_log WHERE region = ?1 ORDER BY checked_at DESC LIMIT ?2"
  )
    .bind(region, KEEPALIVE_ALERT_THRESHOLD + 1)
    .all<{ ok: number; checked_at: string }>();

  const rows = recent.results;
  if (rows.length < KEEPALIVE_ALERT_THRESHOLD) return;

  const streak = rows.slice(0, KEEPALIVE_ALERT_THRESHOLD);
  if (!streak.every((row) => row.ok === 0)) return;

  const rowBeforeStreak = rows[KEEPALIVE_ALERT_THRESHOLD];
  if (rowBeforeStreak && rowBeforeStreak.ok === 0) return; // already flagged on an earlier day

  await env.ACCOUNTS_DB.prepare("INSERT INTO reconciliation_log (status, detail) VALUES (?1, ?2)")
    .bind(
      "keepalive_alert",
      JSON.stringify({ region, consecutive_failures: KEEPALIVE_ALERT_THRESHOLD, since: streak[streak.length - 1].checked_at })
    )
    .run();
}

/** Compares the D1 ledger against each project's real auth.users (Admin API, needs the
 * service_role key) so a row created some other way (direct SQL, a bug) doesn't silently drift
 * from what's actually in each project. No auto-heal -- log-only, per the "no live alert channel
 * yet" call. No-ops (and says so in the log) until both service_role secrets are set. */
async function runReconciliation(env: Env): Promise<void> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY_EU || !env.SUPABASE_SERVICE_ROLE_KEY_US) {
    await env.ACCOUNTS_DB.prepare("INSERT INTO reconciliation_log (status, detail) VALUES (?1, ?2)")
      .bind("skipped_no_secrets", null)
      .run();
    return;
  }

  try {
    const [euEmails, usEmails] = await Promise.all([
      listAllUserEmails(env, "eu"),
      listAllUserEmails(env, "us"),
    ]);
    const ledger = await env.ACCOUNTS_DB.prepare("SELECT email_key, region FROM accounts").all<{
      email_key: string;
      region: Region;
    }>();

    const ledgerByEmail = new Map(ledger.results.map((row) => [row.email_key, row.region]));
    const mismatches: Array<{ email_key: string; ledger_region: Region | null; real_region: Region }> = [];

    for (const [emails, realRegion] of [
      [euEmails, "eu"],
      [usEmails, "us"],
    ] as const) {
      for (const email of emails) {
        const key = emailKey(email);
        const ledgerRegion = ledgerByEmail.get(key) ?? null;
        if (ledgerRegion !== realRegion) mismatches.push({ email_key: key, ledger_region: ledgerRegion, real_region: realRegion });
      }
    }

    await env.ACCOUNTS_DB.prepare("INSERT INTO reconciliation_log (status, detail) VALUES (?1, ?2)")
      .bind(mismatches.length === 0 ? "ok" : "mismatches_found", JSON.stringify(mismatches))
      .run();
  } catch (err) {
    await env.ACCOUNTS_DB.prepare("INSERT INTO reconciliation_log (status, detail) VALUES (?1, ?2)")
      .bind("error", err instanceof Error ? err.message : String(err))
      .run();
  }
}

/** Paginates GET /auth/v1/admin/users (Supabase's Admin API) to collect every real email in one
 * project. Requires the service_role key -- auth.users isn't reachable through PostgREST. */
async function listAllUserEmails(env: Env, region: Region): Promise<string[]> {
  const { url, serviceRoleKey } = projectConfig(env, region);
  const emails: string[] = [];
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const endpoint = new URL("auth/v1/admin/users", url);
    endpoint.searchParams.set("page", String(page));
    endpoint.searchParams.set("per_page", String(perPage));
    const response = await fetch(endpoint, {
      headers: { apikey: serviceRoleKey!, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!response.ok) throw new Error(`admin/users ${region} page ${page}: HTTP ${response.status}`);
    const body = (await response.json()) as { users: Array<{ email?: string }> };
    for (const user of body.users) if (user.email) emails.push(user.email);
    if (body.users.length < perPage) break;
    page += 1;
  }
  return emails;
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/geo") {
      return handleGeo(request);
    }

    const claimMatch = url.pathname.match(/^\/api\/auth-hook\/([a-z]+)\/claim$/);
    if (request.method === "POST" && claimMatch) {
      const region = claimMatch[1];
      if (!isRegion(region)) return json({ error: { http_code: 400, message: "unknown_region" } }, 400);
      return handleAuthHookClaim(request, env, region);
    }

    if (request.method === "POST" && url.pathname === "/api/region-move/start") {
      return handleRegionMoveStart(request, env);
    }
    if (request.method === "POST" && url.pathname === "/api/region-move/continue") {
      return handleRegionMoveContinue(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/region-move/status") {
      return handleRegionMoveStatus(request, env);
    }

    return json({ error: "not_found" }, 404);
  },

  async scheduled(event, env) {
    if (event.cron === "0 3 * * *") {
      await runKeepalive(env);
    } else if (event.cron === "0 4 * * 1") {
      await runReconciliation(env);
    }
  },
};

export default worker;
