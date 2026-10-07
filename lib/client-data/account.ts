import { createClient, createClientForRegion } from "@/lib/supabase/client";
import { EMAIL_TAKEN_MESSAGE } from "@/lib/auth/passwordAuth";
import { ApiError, extractFunctionErrorMessage, getErrorMessage } from "@/lib/api/client";
import { getActiveRegion, isMultiRegionEnabled, setActiveRegion, workerOrigin, type Region } from "@/lib/supabase/regions";

export async function deleteAccount(): Promise<{ pendingDeletionAt: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("delete-account");
  if (error) {
    throw new ApiError(500, await extractFunctionErrorMessage(error, "Could not delete your account. Please try again."));
  }
  return data;
}

// Called right after a successful sign-in. Silently clears a pending deletion
// (see delete-account) if the user logging back in requested one — returns
// whether that happened, so the caller can welcome them back.
export async function cancelPendingAccountDeletion(): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cancel_pending_account_deletion");
  if (error) return false;
  return data === true;
}

// Called right after a successful sign-in, BEFORE cancelPendingAccountDeletion() -- an account
// this returns a region for was retired by a region move (see moveToOtherRegion below), not a
// user-requested deletion, and must never be silently "reactivated" by cancelPendingAccountDeletion.
// Bypasses RLS via a SECURITY DEFINER RPC, same as that function, since a retired row's own
// pending_deletion_at blocks the normal RLS-gated read this would otherwise need.
export async function checkAccountMoved(): Promise<Region | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("check_account_moved");
  if (error || !data) return null;
  return data as Region;
}

// Whether the signed-in account has a password (email + password sign-in, or one added later from
// Settings). Supabase doesn't expose that on the User object, so a SECURITY DEFINER RPC reads
// auth.users.encrypted_password. Null when it can't be determined -- callers treat that as "unknown",
// not as "no password".
export async function hasPassword(): Promise<boolean | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("has_password");
  if (error || typeof data !== "boolean") return null;
  return data;
}

export async function switchGoogleAccount(newIdentityId: string): Promise<{ email: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("switch-google-account", {
    body: { newIdentityId },
  });
  if (error) {
    throw new ApiError(
      500,
      await extractFunctionErrorMessage(error, "Could not switch your Google account. Please try again.")
    );
  }
  return data;
}

// --- Self-service region move -------------------------------------------------------------
// These call the Cloudflare Worker directly (same origin -- wrangler.jsonc routes /api/* to it),
// not a Supabase Edge Function, since the Worker is the one place with both regions' service-role
// keys and the D1 email->region ledger. See worker/lib/regionMove.ts.

async function currentAccessToken(): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new ApiError(401, "You're not signed in.");
  return session.access_token;
}

async function regionMoveFetch(path: string, sourceRegion: Region, body?: Record<string, unknown>): Promise<unknown> {
  const token = await currentAccessToken();
  const method = body === undefined && path.includes("status") ? "GET" : "POST";
  const url = `${workerOrigin()}${method === "GET" ? `${path}?sourceRegion=${sourceRegion}` : path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify({ sourceRegion, ...body }) : undefined,
    });
  } catch (err) {
    throw new ApiError(0, getErrorMessage(err, "Couldn't reach the server. Check your connection and try again."));
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof (json as { error?: unknown }).error === "string" ? (json as { error: string }).error : "Something went wrong.";
    throw new ApiError(res.status, message);
  }
  return json;
}

export interface RegionMoveStatus {
  active: boolean;
  status?: string;
  sourceRegion?: Region;
  targetRegion?: Region;
}

export async function getRegionMoveStatus(sourceRegion: Region): Promise<RegionMoveStatus> {
  return (await regionMoveFetch("/api/region-move/status", sourceRegion)) as RegionMoveStatus;
}

interface ContinueResult {
  done: boolean;
  status: string;
  error?: string;
  targetRegion?: Region;
  email?: string;
  signInTokenHash?: string | null;
  completedSteps?: number;
  totalSteps?: number;
}

export interface RegionMoveProgress {
  status: string;
  percent: number;
}

/**
 * Runs the whole move: starts it (or resumes an already-started one), loops `/continue` until
 * `done`, then establishes a session on the target project via a one-time magic-link token --
 * NOT by sending the user back through "Continue with Google", since whether a fresh OAuth
 * attempt would auto-link to the admin-API-created target account isn't something this app's
 * code can guarantee (see the comment on generateMagicLinkTokenHash in worker/lib/regionMove.ts).
 * Leaves `vici-active-region` pointed at the target and a valid session in its storage; the
 * caller is responsible for a hard navigation afterward (AuthProvider fixes its client at mount).
 */
export async function moveToOtherRegion(
  sourceRegion: Region,
  targetRegion: Region,
  onProgress?: (progress: RegionMoveProgress) => void,
  /** For an account that signs in with a password: the Admin API can't copy the hash to the new
   * project, so the person re-enters it (already verified by the caller) and the Worker sets it on
   * the new account at creation time. Never persisted anywhere. */
  password?: string
): Promise<{ targetRegion: Region }> {
  await regionMoveFetch("/api/region-move/start", sourceRegion, { targetRegion });

  let result: ContinueResult;
  for (;;) {
    result = (await regionMoveFetch(
      "/api/region-move/continue",
      sourceRegion,
      password ? { password } : undefined
    )) as ContinueResult;
    if (result.error) throw new ApiError(500, result.error);
    const percent =
      result.totalSteps && result.totalSteps > 0 ? Math.round(((result.completedSteps ?? 0) / result.totalSteps) * 100) : 0;
    onProgress?.({ status: result.status, percent });
    if (result.done) break;
  }

  // The move is complete, so the source account is retired (see check_account_moved): whatever
  // happens below, its session in this browser is dead weight. Left in localStorage it would be
  // picked up again the moment the active region points back at the source (a failed sign-in on
  // the target, the login page's region picker, ...), and since the retired row is hidden from it
  // by RLS, the app would see an "authenticated" user with no settings at all. Dropped LAST, right
  // before the caller's hard navigation: AuthProvider is still subscribed to the source client, so
  // this flips it to "anon" and the page behind the progress ring would otherwise swap to a loader.
  try {
    if (!result.signInTokenHash) {
      throw new ApiError(500, "Your account was moved, but we couldn't sign you in automatically. Please sign in again.");
    }

    setActiveRegion(targetRegion);
    const targetClient = createClient();
    // type: "email" (not the deprecated "magiclink") is what verifyOtp expects for a token_hash --
    // see @supabase/auth-js's GoTrueClient.verifyOtp doc comment ("magiclink"/"signup" types are
    // deprecated for verification; generateLink's own `type` on the Worker side is unrelated and
    // still "magiclink" there, that's the link-generation purpose, not the verification method).
    // email must NOT be sent alongside token_hash -- confirmed live against GoTrue's /auth/v1/verify,
    // which rejects that combination with "Only the token_hash and type should be provided".
    const { error: verifyError } = await targetClient.auth.verifyOtp({
      token_hash: result.signInTokenHash,
      type: "email",
    });
    if (verifyError) {
      throw new ApiError(500, "Your account was moved, but we couldn't sign you in automatically. Please sign in again.");
    }

    return { targetRegion };
  } finally {
    try {
      await createClientForRegion(sourceRegion).auth.signOut({ scope: "local" });
    } catch {
      // Best effort -- the move itself succeeded, and useRequireOnboarded's retired-account check
      // cleans up a session that is still around.
    }
  }
}

// --- Email change (email + password accounts) ----------------------------------------------
// supabase.auth.updateUser({ email }) doesn't run the "Before User Created" hook that keeps the D1
// email -> region ledger, so these bracket it. See worker/lib/emailChange.ts. With multi-region off
// there is no ledger and nothing to do.

const EMAIL_CHANGE_ERRORS: Record<string, string> = {
  email_unavailable: EMAIL_TAKEN_MESSAGE,
  same_email: "That's already your email address.",
  invalid_email: "That email address doesn't look valid.",
  region_move_in_progress: "Your account is being moved to another region. Try again once that finishes.",
};

async function emailChangeFetch(path: string, body: Record<string, unknown>): Promise<unknown> {
  const token = await currentAccessToken();
  let res: Response;
  try {
    res = await fetch(`${workerOrigin()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ region: getActiveRegion(), ...body }),
    });
  } catch (err) {
    throw new ApiError(0, getErrorMessage(err, "Couldn't reach the server. Check your connection and try again."));
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = typeof (json as { error?: unknown }).error === "string" ? (json as { error: string }).error : "";
    throw new ApiError(res.status, EMAIL_CHANGE_ERRORS[code] ?? "Something went wrong. Please try again.");
  }
  return json;
}

/** Call BEFORE supabase.auth.updateUser({ email }). Throws an ApiError with a user-facing message
 * when the new address can't be claimed. */
export async function startEmailChange(newEmail: string): Promise<void> {
  if (!isMultiRegionEnabled()) return;
  await emailChangeFetch("/api/email-change/start", { newEmail });
}

/** Call right after the new email was confirmed. Best-effort and never throws: if it fails, the
 * weekly sweep (worker/lib/accountSweep.ts) finalizes the change. */
export async function finalizeEmailChange(): Promise<void> {
  if (!isMultiRegionEnabled()) return;
  try {
    await emailChangeFetch("/api/email-change/finalize", {});
  } catch {
    // Left for the sweep.
  }
}

/** Call when updateUser({ email }) failed after startEmailChange succeeded. Best-effort. */
export async function cancelEmailChange(): Promise<void> {
  if (!isMultiRegionEnabled()) return;
  try {
    await emailChangeFetch("/api/email-change/cancel", {});
  } catch {
    // Left for the sweep.
  }
}
