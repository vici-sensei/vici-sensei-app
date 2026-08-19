import { createClient } from "@/lib/supabase/client";
import { ApiError, extractFunctionErrorMessage } from "@/lib/api/client";

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
