import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

export class ServerApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ServerApiError'
    this.status = status
  }
}

async function buildBaseUrl() {
  const h = await headers()
  const host = h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'development' ? 'http' : 'https')
  return `${proto}://${host}`
}

async function request(path: string): Promise<Response> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ')
  const baseUrl = await buildBaseUrl()

  return fetch(`${baseUrl}${path}`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  })
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (body && typeof body.error === 'string') return body.error
  } catch {
    // ignore — fall back to statusText below
  }
  return res.statusText || `Request failed with status ${res.status}`
}

/**
 * Server-side fetch for /api/* routes, forwarding the Supabase session cookie.
 * On 401 it redirects to /login (throw is unreachable — redirect() throws
 * internally). On any other non-2xx it throws ServerApiError.
 */
export async function fetchServer<T>(path: string): Promise<T> {
  const res = await request(path)

  if (res.status === 401) {
    redirect('/login')
  }

  if (!res.ok) {
    throw new ServerApiError(res.status, await readErrorMessage(res))
  }

  return res.json() as Promise<T>
}

/**
 * Same as fetchServer, but treats the given statuses (default: 404) as "no
 * data" and returns null instead of throwing — used for e.g. /api/study-settings
 * before onboarding is complete, where a 404 is an expected, meaningful state.
 */
export async function fetchServerOptional<T>(
  path: string,
  treatAsNullStatuses: number[] = [404]
): Promise<T | null> {
  const res = await request(path)

  if (treatAsNullStatuses.includes(res.status)) {
    return null
  }

  if (res.status === 401) {
    redirect('/login')
  }

  if (!res.ok) {
    throw new ServerApiError(res.status, await readErrorMessage(res))
  }

  return res.json() as Promise<T>
}
