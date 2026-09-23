import type { Region } from "./region";

export interface Env {
  ACCOUNTS_DB: D1Database;
  SUPABASE_URL_EU: string;
  SUPABASE_ANON_KEY_EU: string;
  SUPABASE_URL_US: string;
  SUPABASE_ANON_KEY_US: string;
  // Secrets (`wrangler secret put <name>`) -- unset until Phase 4 configures each project's
  // "Before User Created" hook in the Dashboard, which is when Supabase generates them.
  AUTH_HOOK_SECRET_EU?: string;
  AUTH_HOOK_SECRET_US?: string;
  // Secrets. Set with `wrangler secret put <name>` run by the user directly, never pasted in
  // chat -- these bypass RLS entirely, more sensitive than anything else this Worker touches.
  // Reconciliation and region moves no-op/fail until both are set.
  SUPABASE_SERVICE_ROLE_KEY_EU?: string;
  SUPABASE_SERVICE_ROLE_KEY_US?: string;
}

export function projectConfig(env: Env, region: Region) {
  return region === "eu"
    ? { url: env.SUPABASE_URL_EU, anonKey: env.SUPABASE_ANON_KEY_EU, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY_EU }
    : { url: env.SUPABASE_URL_US, anonKey: env.SUPABASE_ANON_KEY_US, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY_US };
}
