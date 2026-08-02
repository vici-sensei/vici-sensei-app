import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Request-scoped Supabase client. Wrapped in React.cache so layouts and the
 * page rendered inside them share the same client instance instead of each
 * creating (and cookie-parsing) their own.
 */
export const getSupabaseServerClient = cache(createClient);

/**
 * Request-scoped auth check for Server Components (layouts/pages), mirroring
 * requireUser() in lib/api/errors.ts but redirecting instead of returning a
 * JSON 401 — the caller doesn't need to handle a null case. Cached so it only
 * calls supabase.auth.getUser() once per request even though every layout in
 * the tree calls it.
 */
export const getAuthedUser = cache(async () => {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return user;
});
