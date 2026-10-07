import { createClient } from "@/lib/supabase/client";
import { checkAccountMoved } from "@/lib/client-data/account";
import { hardNavigate } from "@/lib/auth/finishSignIn";
import { LOGIN_ERROR, loginErrorUrl } from "@/lib/auth/loginErrors";

let pending: Promise<boolean> | null = null;

/**
 * The already-open-session counterpart of completeSignIn()'s moved-account check: a browser can still
 * hold a session for an account that was moved to the other region (the region move's own cleanup
 * failed, another tab or device, a session that outlived a failed sign-in). The retired row is hidden
 * from that session by RLS, so every per-user fetch comes back empty -- most visibly the study
 * settings, which `fetchStudySettings` reports as `null` rather than as an error.
 *
 * Call it when that happens. If the account really was moved, this signs the session out and sends
 * the person to /login pointed at the region their data lives in now, and resolves `true`; for
 * anything else it resolves `false` and leaves the caller to decide. A hard navigation (not
 * router.replace), the same as the password login's moved branch: AuthProvider is bound to the region
 * that was active when it mounted, and useRequireAuth's own redirect to a plain /login would
 * otherwise race this one and drop the `account_moved` notice.
 *
 * Concurrent calls (several layouts, an effect re-running) share one check.
 */
export function leaveIfAccountMoved(): Promise<boolean> {
  pending ??= (async () => {
    const movedTo = await checkAccountMoved();
    if (!movedTo) return false;
    try {
      await createClient().auth.signOut();
    } catch {
      // Still send them on: the next load runs this check again against whatever session is left.
    }
    hardNavigate(loginErrorUrl(LOGIN_ERROR.accountMoved, movedTo));
    return true;
  })().finally(() => {
    pending = null;
  });
  return pending;
}
