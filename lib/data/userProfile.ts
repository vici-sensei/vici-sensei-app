import { cache } from "react";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { UserProfile } from "@/lib/types";

export async function fetchUserProfile(supabase: SupabaseServerClient, userId: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from("users")
    .select("email, display_name, avatar_url, is_premium, created_at")
    .eq("id", userId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Cached per-request so every layout/page that needs the profile shares one query. */
export const getUserProfile = cache(fetchUserProfile);
