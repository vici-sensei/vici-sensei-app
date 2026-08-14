import type { AppSupabaseClient } from "@/lib/supabase/types";

/** Server clock reading (ms since epoch), via the `get_server_time()` RPC. */
export async function fetchServerTimeMs(supabase: AppSupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("get_server_time");
  if (error) throw new Error(error.message);
  return new Date(data).getTime();
}
