import type { Env } from "./env";
import { emailKey, type Region } from "./region";
import { resolveIdentity } from "./regionMove";

/**
 * Keeps the D1 email -> region ledger right when a signed-in account changes its email
 * (Settings -> Change email). Supabase's "Before User Created" hook (the thing that fills the
 * ledger) never fires for that, so the client brackets the change with these calls:
 *
 *   start    -- BEFORE supabase.auth.updateUser({ email }): claims the new email for the caller's
 *               region, or refuses it when the other region already holds it.
 *   finalize -- AFTER the new email was confirmed (the token now carries it): frees the old email.
 *   cancel   -- when updateUser failed or the person gave up: releases a claim `start` made.
 *
 * Every call re-derives the user from their access token (see resolveIdentity); nothing the
 * client says about who it is is trusted.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

interface EmailChangeRow {
  user_id: string;
  region: Region;
  old_key: string;
  new_key: string;
  claimed_by_us: number;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function handleEmailChangeStart(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const identity = await resolveIdentity(request, env, typeof body.region === "string" ? body.region : null);
  if (identity instanceof Response) return identity;
  const { id: userId, email: currentEmail, region } = identity;

  const newEmail = typeof body.newEmail === "string" ? body.newEmail.trim() : "";
  if (newEmail.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
    return json({ error: "invalid_email" }, 400);
  }
  const newKey = emailKey(newEmail);
  const oldKey = emailKey(currentEmail);
  if (newKey === oldKey) return json({ error: "same_email" }, 400);

  // A region move rewrites the ledger row for this email on its own schedule; changing the email
  // underneath it would orphan the move.
  const activeMove = await env.ACCOUNTS_DB.prepare(
    "SELECT 1 AS hit FROM region_moves WHERE email_key = ?1 AND status <> 'completed'"
  )
    .bind(oldKey)
    .first();
  if (activeMove) return json({ error: "region_move_in_progress" }, 409);

  try {
    const insert = await env.ACCOUNTS_DB.prepare(
      "INSERT INTO accounts (email_key, region) VALUES (?1, ?2) ON CONFLICT(email_key) DO NOTHING"
    )
      .bind(newKey, region)
      .run();
    const claimedByUs = insert.meta.changes > 0;

    const claimed = await env.ACCOUNTS_DB.prepare("SELECT region FROM accounts WHERE email_key = ?1")
      .bind(newKey)
      .first<{ region: Region }>();
    if (!claimed) return json({ error: "claim_failed" }, 500);
    if (claimed.region !== region) {
      // Deliberately the same answer as "taken": telling an authenticated user "that email lives in
      // the other region" would turn this endpoint into an email-existence lookup (Decision 3).
      return json({ error: "email_unavailable" }, 409);
    }

    // A previous, unconfirmed attempt by this same user: release ITS claim (only if that one was
    // ours and it isn't the address we are about to use) before recording the new attempt.
    const previous = await env.ACCOUNTS_DB.prepare("SELECT * FROM email_changes WHERE user_id = ?1 AND region = ?2")
      .bind(userId, region)
      .first<EmailChangeRow>();
    const statements = [];
    if (previous && previous.claimed_by_us === 1 && previous.new_key !== newKey) {
      statements.push(
        env.ACCOUNTS_DB.prepare("DELETE FROM accounts WHERE email_key = ?1 AND region = ?2").bind(previous.new_key, region)
      );
    }
    statements.push(
      env.ACCOUNTS_DB.prepare(
        `INSERT INTO email_changes (user_id, region, old_key, new_key, claimed_by_us)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(user_id, region) DO UPDATE SET
           old_key = excluded.old_key,
           new_key = excluded.new_key,
           claimed_by_us = CASE WHEN excluded.new_key = email_changes.new_key
             THEN MAX(excluded.claimed_by_us, email_changes.claimed_by_us) ELSE excluded.claimed_by_us END,
           created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
      ).bind(userId, region, oldKey, newKey, claimedByUs ? 1 : 0)
    );
    await env.ACCOUNTS_DB.batch(statements);
    return json({ ok: true });
  } catch {
    return json({ error: "claim_failed" }, 500);
  }
}

export async function handleEmailChangeFinalize(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const identity = await resolveIdentity(request, env, typeof body.region === "string" ? body.region : null);
  if (identity instanceof Response) return identity;
  const { id: userId, email: currentEmail, region } = identity;

  try {
    const row = await env.ACCOUNTS_DB.prepare("SELECT * FROM email_changes WHERE user_id = ?1 AND region = ?2")
      .bind(userId, region)
      .first<EmailChangeRow>();
    if (!row) return json({ ok: true, status: "none" });

    // The token is verified against the project, so `currentEmail` is the account's real email
    // right now. Still the old one = the change isn't confirmed yet; leave everything as it is.
    if (emailKey(currentEmail) !== row.new_key) return json({ ok: true, status: "pending" });

    await env.ACCOUNTS_DB.batch([
      env.ACCOUNTS_DB.prepare(
        "INSERT INTO accounts (email_key, region) VALUES (?1, ?2) ON CONFLICT(email_key) DO NOTHING"
      ).bind(row.new_key, region),
      env.ACCOUNTS_DB.prepare("DELETE FROM accounts WHERE email_key = ?1 AND region = ?2").bind(row.old_key, region),
      env.ACCOUNTS_DB.prepare("DELETE FROM email_changes WHERE user_id = ?1 AND region = ?2").bind(userId, region),
    ]);
    return json({ ok: true, status: "done" });
  } catch {
    return json({ error: "finalize_failed" }, 500);
  }
}

export async function handleEmailChangeCancel(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const identity = await resolveIdentity(request, env, typeof body.region === "string" ? body.region : null);
  if (identity instanceof Response) return identity;
  const { id: userId, email: currentEmail, region } = identity;

  try {
    const row = await env.ACCOUNTS_DB.prepare("SELECT * FROM email_changes WHERE user_id = ?1 AND region = ?2")
      .bind(userId, region)
      .first<EmailChangeRow>();
    if (!row) return json({ ok: true });

    // If the account's email already IS the new one, the change went through (confirmed in another
    // tab or device) and the claim is the account's real one -- only the bookkeeping row goes.
    const confirmedAlready = emailKey(currentEmail) === row.new_key;
    const statements = [];
    if (row.claimed_by_us === 1 && !confirmedAlready) {
      statements.push(
        env.ACCOUNTS_DB.prepare("DELETE FROM accounts WHERE email_key = ?1 AND region = ?2").bind(row.new_key, region)
      );
    }
    statements.push(env.ACCOUNTS_DB.prepare("DELETE FROM email_changes WHERE user_id = ?1 AND region = ?2").bind(userId, region));
    await env.ACCOUNTS_DB.batch(statements);
    return json({ ok: true });
  } catch {
    return json({ error: "cancel_failed" }, 500);
  }
}
