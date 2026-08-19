import { AuthClient } from '@supabase/auth-js'
import { PostgrestClient } from '@supabase/postgrest-js'
import { StorageClient } from '@supabase/storage-js'
import { FunctionsClient } from '@supabase/functions-js'
import type { AppSupabaseClient } from './types'

let client: AppSupabaseClient | null = null

/** Attaches the anon key / session bearer token to a request, unless the caller already set one. */
function createAuthedFetch(
  supabaseKey: string,
  getAccessToken: () => Promise<string | null>
): typeof fetch {
  return async (input, init) => {
    const token = await getAccessToken()
    const headers = new Headers(init?.headers)
    if (!headers.has('apikey')) headers.set('apikey', supabaseKey)
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token ?? supabaseKey}`)
    return fetch(input, { ...init, headers })
  }
}

/**
 * Singleton browser client — session lives in localStorage, no server ever needs to share it via cookies.
 *
 * Hand-assembled from the granular `@supabase/*-js` packages instead of `@supabase/supabase-js`, whose
 * `SupabaseClient` constructor unconditionally pulls in `@supabase/realtime-js` (~115KB uncompressed)
 * with no opt-out. This app never uses Realtime, so this mirrors supabase-js's own documented
 * "standalone import for bundle-sensitive environments" pattern for auth/postgrest/storage/functions.
 */
export function createClient(): AppSupabaseClient {
  if (client) return client

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const baseUrl = new URL(supabaseUrl.endsWith('/') ? supabaseUrl : `${supabaseUrl}/`)

  // GoTrueClient manages its own token switching internally, so it alone gets a static
  // Authorization fallback baked into its base headers.
  const auth = new AuthClient({
    url: new URL('auth/v1', baseUrl).href,
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    storageKey: `sb-${baseUrl.hostname.split('.')[0]}-auth-token`,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  })

  // rest/storage/functions must NOT get a static Authorization header here: PostgrestClient/
  // StorageClient/FunctionsClient merge their base headers into every request before calling
  // `fetch`, and authedFetch only fills in Authorization when it's absent — a static value here
  // would permanently shadow the live session token with the anon key.
  const getAccessToken = async () => (await auth.getSession()).data.session?.access_token ?? null
  const authedFetch = createAuthedFetch(supabaseKey, getAccessToken)

  const rest = new PostgrestClient(new URL('rest/v1', baseUrl).href, {
    headers: { apikey: supabaseKey },
    schema: 'public',
    fetch: authedFetch,
  })

  const storage = new StorageClient(new URL('storage/v1', baseUrl).href, { apikey: supabaseKey }, authedFetch)

  const functions = new FunctionsClient(new URL('functions/v1', baseUrl).href, {
    headers: { apikey: supabaseKey },
    customFetch: authedFetch,
  })

  client = {
    auth,
    from: rest.from.bind(rest),
    rpc: rest.rpc.bind(rest),
    storage,
    functions,
  }
  return client
}
