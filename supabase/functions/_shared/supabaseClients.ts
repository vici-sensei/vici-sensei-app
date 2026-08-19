import { createClient, type SupabaseClient, type User } from "jsr:@supabase/supabase-js@2";
import { jsonResponse } from "./cors.ts";

/** User-scoped client (RLS applies) — identifies the caller via their own Authorization header. */
export function createUserClient(req: Request): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization")! } },
  });
}

/** Service-role client — bypasses RLS, for writes/reads no end-user session can grant. */
export function createAdminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** User-scoped client + the caller's identity, or a ready-to-return 401 Response if there's no
 * valid session -- callers check `if (auth instanceof Response) return auth;`. */
export async function requireUser(req: Request): Promise<{ supabase: SupabaseClient; user: User } | Response> {
  const supabase = createUserClient(req);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse(req, { error: "You are not logged in. Please log in." }, 401);
  }
  return { supabase, user };
}
