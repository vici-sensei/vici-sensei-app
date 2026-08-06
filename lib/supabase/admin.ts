import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getServerEnv } from '@/lib/env'

export function createAdminClient() {
  const url = getServerEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = getServerEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !serviceRoleKey) {
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
