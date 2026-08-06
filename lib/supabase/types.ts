import type { SupabaseClient } from "@supabase/supabase-js";

/** Generic Supabase client type — satisfied by both the server (cookie) client and the browser client, so `lib/data/*.ts` query functions don't care which one calls them. */
export type AppSupabaseClient = SupabaseClient;
