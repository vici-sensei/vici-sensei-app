import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // `setAll` was called from a Server Component, which can't write cookies —
            // safe to ignore here since proxy.ts already refreshes the session on every
            // navigation to a protected route.
          }
        },
      },
    }
  )
}
