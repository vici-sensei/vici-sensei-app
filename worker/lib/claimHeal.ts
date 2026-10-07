import type { Env } from "./env";
import { projectConfig } from "./env";
import { emailKey, type Region } from "./region";

/**
 * The email -> region ledger is claimed by the "Before User Created" hook BEFORE Supabase creates the
 * user, and only a few flows ever release it (region move, email change, the weekly sweep of
 * unconfirmed sign-ups). Anything else that leaves a claim without an account behind -- a deleted
 * account, a user removed from the Dashboard, a sign-up that failed after the hook ran (SMTP error,
 * rolled-back transaction) -- would lock that email to its region for good: the other region's
 * hook would answer `wrong_region:<region>` for an account that doesn't exist.
 *
 * So before the hook sends that answer it asks the claimed region's project whether the account is
 * really there, and takes the claim over when it isn't. Every doubt resolves to "keep the claim":
 * no secret, HTTP error, timeout, more users than we are willing to scan, or a claim too recent to
 * tell apart from a sign-up that is still being created.
 */

/** The hook runs before the user row exists, so a claim this young may belong to a sign-up that is
 * in flight right now -- never take those over. */
const HEAL_GRACE_MS = 2 * 60 * 1000;
/** Supabase gives HTTP auth hooks 5 s; the lookup gets less than that so the answer always lands. */
const LOOKUP_TIMEOUT_MS = 3500;
const LOOKUP_PER_PAGE = 1000;
/** Beyond this many users a full scan no longer fits the hook's time budget: stop healing instead of
 * guessing. Replace with a per-email lookup (an RPC) before the user base gets anywhere near it. */
const LOOKUP_MAX_PAGES = 5;

interface AdminUser {
  email?: string;
}

/**
 * Whether `key` has an account in `region`: true/false when the project answered, null when we
 * couldn't tell. A full scan with our own `emailKey()` comparison on purpose -- the Admin API's
 * `filter` does a case-sensitive LIKE, and `auth.users.email` keeps whatever case Google sent, so a
 * filtered lookup could miss a real account and let a duplicate in.
 */
export async function accountExistsInRegion(env: Env, region: Region, key: string): Promise<boolean | null> {
  const { url, serviceRoleKey } = projectConfig(env, region);
  if (!serviceRoleKey) return null;

  const signal = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
  try {
    for (let page = 1; page <= LOOKUP_MAX_PAGES; page += 1) {
      const endpoint = new URL("auth/v1/admin/users", url);
      endpoint.searchParams.set("page", String(page));
      endpoint.searchParams.set("per_page", String(LOOKUP_PER_PAGE));
      const response = await fetch(endpoint, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        signal,
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { users?: AdminUser[] };
      const users = body.users ?? [];
      if (users.some((user) => user.email && emailKey(user.email) === key)) return true;
      if (users.length < LOOKUP_PER_PAGE) return false;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Called by the hook when `key` is claimed by `claimedRegion` but `callingRegion` is the one asking.
 * Returns true when the claim was an orphan and now belongs to `callingRegion`.
 */
export async function takeOverOrphanClaim(
  env: Env,
  key: string,
  claimedRegion: Region,
  callingRegion: Region
): Promise<boolean> {
  const cutoff = new Date(Date.now() - HEAL_GRACE_MS).toISOString();
  const settled = await env.ACCOUNTS_DB.prepare(
    "SELECT 1 AS settled FROM accounts WHERE email_key = ?1 AND region = ?2 AND updated_at < ?3"
  )
    .bind(key, claimedRegion, cutoff)
    .first();
  if (!settled) return false;

  if ((await accountExistsInRegion(env, claimedRegion, key)) !== false) return false;

  // Compare-and-swap on the old region, so a move or another takeover that got there first wins.
  const result = await env.ACCOUNTS_DB.prepare(
    "UPDATE accounts SET region = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE email_key = ?2 AND region = ?3 AND updated_at < ?4"
  )
    .bind(callingRegion, key, claimedRegion, cutoff)
    .run();
  if (result.meta.changes !== 1) return false;

  await env.ACCOUNTS_DB.prepare("INSERT INTO reconciliation_log (status, detail) VALUES (?1, ?2)")
    .bind("claim_healed", JSON.stringify({ email_key: key, from: claimedRegion, to: callingRegion }))
    .run();
  return true;
}
