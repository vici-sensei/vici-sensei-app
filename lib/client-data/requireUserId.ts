import { createClient } from "@/lib/supabase/client";
import { ApiError } from "@/lib/api/client";

/** The signed-in user's id, for client-data calls that don't get one passed in. Asks the auth
 * server (getUser) rather than trusting the cached session, so a revoked session fails here with
 * a 401 instead of on whichever query happens to run next. */
export async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, "You are not logged in. Please log in.");
  return user.id;
}
