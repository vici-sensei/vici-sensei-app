import { createClient } from "@/lib/supabase/client";
import { cancelPendingAccountDeletion, checkAccountMoved } from "@/lib/client-data/account";
import { clearRememberedEmail } from "@/lib/auth/rememberedEmail";
import { LOGIN_ERROR, loginErrorUrl } from "@/lib/auth/loginErrors";
import type { Region } from "@/lib/supabase/regions";

type FinishedSignIn =
  | { kind: "moved"; region: Region }
  | { kind: "ok"; reactivated: boolean };

/**
 * What every sign-in does right after a session exists, whichever way it was obtained (Google
 * callback, email + password, email confirmation). The order matters: a region-moved account must
 * be caught BEFORE cancelPendingAccountDeletion(), which would otherwise silently "reactivate" the
 * retired duplicate the move left behind (see the region_move_retirement migration). A moved account
 * is signed out here and the caller sends the user to the region their data lives in now.
 */
async function finishSignIn(): Promise<FinishedSignIn> {
  const movedTo = await checkAccountMoved();
  if (movedTo) {
    await createClient().auth.signOut();
    return { kind: "moved", region: movedTo };
  }
  // Best-effort: if this account had requested deletion, logging back in cancels it.
  // cancelPendingAccountDeletion() never throws.
  const reactivated = await cancelPendingAccountDeletion();
  // Signed in for real: the email remembered for the login forms has done its job.
  clearRememberedEmail();
  return { kind: "ok", reactivated };
}

/** A full page load. AuthProvider is bound to the region that was active when it mounted, which is
 * wrong whenever the session turned out to belong to the other one, so a sign-in that may have
 * crossed regions must not use the router. */
export const hardNavigate = (url: string) => window.location.assign(url);

/**
 * The end of every sign-in: runs finishSignIn() and navigates -- to `next` (default /dashboard), or
 * to /login with the "your account has moved" notice when the account lives in the other region.
 * `onReactivated` runs when logging back in cancelled a pending account deletion.
 *
 * `navigate` defaults to a full page load (see hardNavigate); the Google callback, which always
 * returns in the region it started in, passes the router instead.
 */
export async function completeSignIn({
  next = "/dashboard",
  navigate = hardNavigate,
  onReactivated,
}: {
  next?: string;
  navigate?: (url: string) => void;
  onReactivated?: () => void;
} = {}): Promise<void> {
  const finished = await finishSignIn();
  if (finished.kind === "moved") {
    navigate(loginErrorUrl(LOGIN_ERROR.accountMoved, finished.region));
    return;
  }
  if (finished.reactivated) onReactivated?.();
  navigate(next);
}
