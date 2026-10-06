import { createClient } from "@/lib/supabase/client";
import { cancelPendingAccountDeletion, checkAccountMoved } from "@/lib/client-data/account";
import { clearRememberedEmail } from "@/lib/auth/rememberedEmail";
import type { Region } from "@/lib/supabase/regions";

export type FinishedSignIn =
  | { kind: "moved"; region: Region }
  | { kind: "ok"; reactivated: boolean };

/**
 * What every sign-in does right after a session exists, whichever way it was obtained (Google
 * callback, email + password, email confirmation). The order matters: a region-moved account must
 * be caught BEFORE cancelPendingAccountDeletion(), which would otherwise silently "reactivate" the
 * retired duplicate the move left behind (see the region_move_retirement migration). A moved account
 * is signed out here and the caller sends the user to the region their data lives in now.
 */
export async function finishSignIn(): Promise<FinishedSignIn> {
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
