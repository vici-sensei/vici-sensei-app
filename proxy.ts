import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// În Next.js 16, funcția principală trebuie să se numească exact "proxy"
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Inițializarea clientului Supabase pentru noul sistem de Proxy
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // 1. Setează cookie-urile pe request-ul curent, incluzând opțiunile (esențial pentru PKCE și sesiune)
          cookiesToSet.forEach(({ name, value, options }) => 
            request.cookies.set({ name, value, ...options })
          )
          
          // 2. Re-inițializează răspunsul cu request-ul actualizat
          response = NextResponse.next({
            request,
          })
          
          // 3. Aplică cookie-urile și pe răspunsul final care pleacă spre browser
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Verificăm starea sesiunii utilizatorului
  const { data: { user } } = await supabase.auth.getUser()
  const url = request.nextUrl.clone()

  // Toate rutele autentificate — restul (login, session-expired, auth/callback, api/*) rămân publice la acest nivel;
  // /api/* face propriul guard (401 JSON) prin requireUser(), iar /onboarding are nevoie doar de sesiune, nu de
  // onboarding_completed (acel gate mai fin trăiește în layout-urile (shell)/(study), care oricum fac fetch de settings).
  const PROTECTED_PREFIXES = ['/dashboard', '/study', '/browse', '/progress', '/settings', '/onboarding']

  if (!user && PROTECTED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && url.pathname.startsWith('/login')) {
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return response
}

// Configurare Matcher pentru proxy
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}