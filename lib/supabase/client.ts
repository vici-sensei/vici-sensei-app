import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { AppSupabaseClient } from './types'

let client: AppSupabaseClient | null = null

/** Singleton browser client — session lives in localStorage, no server ever needs to share it via cookies. */
export function createClient(): AppSupabaseClient {
  if (client) return client
  client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        detectSessionInUrl: true,
        flowType: 'pkce',
        persistSession: true,
      },
    }
  )
  return client
}
