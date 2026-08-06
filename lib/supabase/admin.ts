import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getServerEnv } from '@/lib/env'

export function createAdminClient() {
  // Static property access (not getServerEnv) so Next.js inlines the value at build time —
  // this is a public URL, not a secret, and isn't bound as a Cloudflare Worker var in production.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = getServerEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.')
  }
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (Supabase dashboard > Project Settings > API) to use admin-only operations.'
    )
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
