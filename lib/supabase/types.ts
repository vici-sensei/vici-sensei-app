import type { GoTrueClient } from "@supabase/auth-js";
import type { PostgrestClient } from "@supabase/postgrest-js";
import type { StorageClient } from "@supabase/storage-js";
import type { FunctionsClient } from "@supabase/functions-js";

/**
 * The subset of `SupabaseClient` this app actually uses — hand-assembled from the granular
 * `@supabase/*-js` packages in lib/supabase/client.ts so `@supabase/realtime-js` (unused: no
 * `.channel()`/postgres_changes anywhere) never enters the bundle. Satisfied by the browser
 * client, so `lib/data/*.ts` query functions don't care which caller built it.
 *
 * `AuthClient` (the value exported by `@supabase/auth-js`) is `GoTrueClient` under an alias —
 * `GoTrueClient` is used here because only the class declaration doubles as a type.
 */
export interface AppSupabaseClient {
  auth: GoTrueClient;
  from: PostgrestClient["from"];
  rpc: PostgrestClient["rpc"];
  storage: StorageClient;
  functions: FunctionsClient;
}
