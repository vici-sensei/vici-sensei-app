import { emailKey, isRegion, regionFromCfContinent, type Region } from "./lib/region";
import { verifyStandardWebhook } from "./lib/webhooks";

export interface Env {
  ACCOUNTS_DB: D1Database;
  SUPABASE_URL_EU: string;
  SUPABASE_ANON_KEY_EU: string;
  SUPABASE_URL_US: string;
  SUPABASE_ANON_KEY_US: string;
  // Secrets (`wrangler secret put <name>`) -- unset until Phase 4 configures each project's
  // "Before User Created" hook in the Dashboard, which is when Supabase generates them.
  AUTH_HOOK_SECRET_EU?: string;
  AUTH_HOOK_SECRET_US?: string;
  // Secrets. Set with `wrangler secret put <name>` run by the user directly, never pasted in
  // chat -- these bypass RLS entirely, more sensitive than anything else this Worker touches.
  // Reconciliation no-ops until both are set.
  SUPABASE_SERVICE_ROLE_KEY_EU?: string;
  SUPABASE_SERVICE_ROLE_KEY_US?: string;
}

function projectConfig(env: Env, region: Region) {
  return region === "eu"
    ? { url: env.SUPABASE_URL_EU, anonKey: env.SUPABASE_ANON_KEY_EU, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY_EU }
    : { url: env.SUPABASE_URL_US, anonKey: env.SUPABASE_ANON_KEY_US, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY_US };
}

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
  }
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
