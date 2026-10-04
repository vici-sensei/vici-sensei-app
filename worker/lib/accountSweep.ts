import type { Env } from "./env";
import { projectConfig } from "./env";
import { emailKey, type Region } from "./region";

/**
 * Weekly housekeeping for the two things email + password sign-in leaves behind
 * (docs/PASSWORD_AUTH_PLAN.md, phase 2):
 *
 *  1. Sign-ups that never confirmed their email. Supabase doesn't expire them, and each one still
 *     holds its email in the D1 ledger -- so a typo'd address would keep that email "taken" by this
 *     region forever. After a week they are deleted and the ledger row released.
 *  2. Email changes that were started and never finished (`email_changes` rows). The claim the
 *     change made on the new address is released, unless the change actually went through on
 *     another device -- then it is finalized instead, which is exactly what the app would have done.
 *
 * Deliberately narrow: an account is only ever deleted when it has never been confirmed, never
 * signed in, and has no identity but `email`. Anything a person ever used is untouched.
 */

const UNCONFIRMED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DELETIONS_PER_RUN = 50;

interface AdminUser {
  id: string;
  email?: string;
  created_at?: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  identities?: Array<{ provider?: string }> | null;
}

function adminHeaders(serviceRoleKey: string): HeadersInit {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
}

async function listAllUsers(env: Env, region: Region): Promise<AdminUser[]> {
  const { url, serviceRoleKey } = projectConfig(env, region);
  const users: AdminUser[] = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const endpoint = new URL("auth/v1/admin/users", url);
    endpoint.searchParams.set("page", String(page));
    endpoint.searchParams.set("per_page", String(perPage));
    const res = await fetch(endpoint, { headers: adminHeaders(serviceRoleKey!) });
    if (!res.ok) throw new Error(`admin/users ${region} page ${page}: HTTP ${res.status}`);
    const body = (await res.json()) as { users: AdminUser[] };
    users.push(...body.users);
    if (body.users.length < perPage) return users;
  }
}

function isStaleUnconfirmed(user: AdminUser, now: number): boolean {
  if (user.email_confirmed_at || user.confirmed_at || user.last_sign_in_at) return false;
  if (!user.email || !user.created_at) return false;
  if (now - Date.parse(user.created_at) < UNCONFIRMED_MAX_AGE_MS) return false;
  const identities = user.identities ?? [];
  return identities.every((identity) => identity.provider === "email");
}

async function log(env: Env, status: string, detail: unknown): Promise<void> {
  await env.ACCOUNTS_DB.prepare("INSERT INTO reconciliation_log (status, detail) VALUES (?1, ?2)")
    .bind(status, JSON.stringify(detail))
    .run();
}

async function sweepUnconfirmedSignups(env: Env, region: Region): Promise<number> {
  const { url, serviceRoleKey } = projectConfig(env, region);
  const now = Date.now();
  const stale = (await listAllUsers(env, region)).filter((user) => isStaleUnconfirmed(user, now));

  let removed = 0;
  for (const user of stale.slice(0, MAX_DELETIONS_PER_RUN)) {
    const res = await fetch(new URL(`auth/v1/admin/users/${user.id}`, url), {
      method: "DELETE",
      headers: adminHeaders(serviceRoleKey!),
    });
    if (!res.ok) continue;
    // Only this region's own claim: the same email may legitimately be claimed by the other one.
    await env.ACCOUNTS_DB.prepare("DELETE FROM accounts WHERE email_key = ?1 AND region = ?2")
      .bind(emailKey(user.email!), region)
      .run();
    removed += 1;
  }
  return removed;
}

async function sweepStaleEmailChanges(env: Env): Promise<{ released: number; finalized: number }> {
  const stale = await env.ACCOUNTS_DB.prepare(
    "SELECT user_id, region, old_key, new_key, claimed_by_us FROM email_changes WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')"
  ).all<{ user_id: string; region: Region; old_key: string; new_key: string; claimed_by_us: number }>();

  let released = 0;
  let finalized = 0;
  for (const row of stale.results) {
    const { url, serviceRoleKey } = projectConfig(env, row.region);
    const res = await fetch(new URL(`auth/v1/admin/users/${row.user_id}`, url), { headers: adminHeaders(serviceRoleKey!) });
    // A user that no longer exists (deleted account): nothing the change could still apply to.
    const user = res.ok ? ((await res.json()) as AdminUser) : null;
    const confirmed = !!user?.email && emailKey(user.email) === row.new_key;

    const statements = [env.ACCOUNTS_DB.prepare("DELETE FROM email_changes WHERE user_id = ?1 AND region = ?2").bind(row.user_id, row.region)];
    if (confirmed) {
      statements.unshift(
        env.ACCOUNTS_DB.prepare("DELETE FROM accounts WHERE email_key = ?1 AND region = ?2").bind(row.old_key, row.region)
      );
      finalized += 1;
    } else if (row.claimed_by_us === 1) {
      statements.unshift(
        env.ACCOUNTS_DB.prepare("DELETE FROM accounts WHERE email_key = ?1 AND region = ?2").bind(row.new_key, row.region)
      );
      released += 1;
    }
    await env.ACCOUNTS_DB.batch(statements);
  }
  return { released, finalized };
}

/** Runs from the weekly cron. No-ops until both service-role secrets are set (the reconciliation
 * job next to it already logs that). Logs only when it actually did something. */
export async function runAccountSweep(env: Env): Promise<void> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY_EU || !env.SUPABASE_SERVICE_ROLE_KEY_US) return;
  try {
    const removed: Record<Region, number> = { eu: 0, us: 0 };
    for (const region of ["eu", "us"] as const) removed[region] = await sweepUnconfirmedSignups(env, region);
    const changes = await sweepStaleEmailChanges(env);
    if (removed.eu + removed.us + changes.released + changes.finalized > 0) {
      await log(env, "account_sweep", { unconfirmed_removed: removed, email_changes: changes });
    }
  } catch (err) {
    await log(env, "account_sweep_error", err instanceof Error ? err.message : String(err));
  }
}
