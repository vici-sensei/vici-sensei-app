import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Fișier redenumit din proxy.ts în middleware.ts: proxy.ts rulează exclusiv pe
// runtime Node.js în Next 16 (fără opțiune de a alege edge), iar adaptorul
// Cloudflare (OpenNext) suportă momentan doar middleware pe runtime Edge.
export const runtime = 'experimental-edge'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Inițializarea clientului Supabase pentru middleware
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

  // Verificăm starea sesiunii utilizatorului. supabase.auth.getUser() face un round-trip de
  // rețea către Supabase — dacă acesta eșuează (timeout, blip temporar), excepția nesurprinsă
  // dobora întreaga funcție edge (inclusiv pe /login). Tratăm eșecul ca "neautentificat" în loc
  // să lăsăm middleware-ul să crape.
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (error) {
    console.error('middleware: supabase.auth.getUser() a eșuat', error)
  }

  const url = request.nextUrl.clone()

  // Matcher-ul de mai jos deja limitează middleware-ul la exact aceste prefixe + /login, deci getUser()
  // nu se mai execută pe /api/* (are propriul guard prin requireUser()) sau pe rutele public (/, /session-expired,
  // /auth/callback). /onboarding are nevoie doar de sesiune, nu de onboarding_completed (acel gate mai fin
  // trăiește în layout-urile (shell)/(study), care oricum fac fetch de settings).
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

// Configurare Matcher pentru middleware — rulează doar pe rutele protejate (unde chiar
// redirecționăm spre /login dacă nu există sesiune) și pe /login (pentru redirect
// invers, spre /dashboard, dacă userul e deja autentificat). /api/* e exclus complet:
// fiecare rută API își face propriul guard prin requireUser(), deci getUser() aici ar
// fi doar un round-trip suplimentar irosit.
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/study/:path*',
    '/browse/:path*',
    '/progress/:path*',
    '/settings/:path*',
    '/onboarding/:path*',
    '/login',
  ],
}
