import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { UserProfile } from "@/lib/types";

const PROFILE_ROW_MISSING = "PGRST116";
const PROFILE_FETCH_RETRIES = 3;
const PROFILE_FETCH_RETRY_DELAY_MS = 200;

export async function fetchUserProfile(supabase: AppSupabaseClient, userId: string): Promise<UserProfile> {
  // Right after a brand-new sign-up, the handle_new_user trigger's insert into `users` can
  // still be committing when this first post-auth request lands, so .single() sees 0 rows
  // and errors with PGRST116. A couple of short retries absorb that race instead of crashing
  // the shell layout on every first-time login; any other error still throws immediately.
  for (let attempt = 1; attempt <= PROFILE_FETCH_RETRIES; attempt++) {
    const { data, error } = await supabase
      .from("users")
      .select("email, display_name, avatar_url, is_premium, created_at")
      .eq("id", userId)
      .single();

    if (!error) return data;
    if (error.code !== PROFILE_ROW_MISSING || attempt === PROFILE_FETCH_RETRIES) {
      throw new Error(error.message);
    }
    await new Promise((resolve) => setTimeout(resolve, PROFILE_FETCH_RETRY_DELAY_MS * attempt));
  }

  throw new Error("Failed to load user profile.");
}
