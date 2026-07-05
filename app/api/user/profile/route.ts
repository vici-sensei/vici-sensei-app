import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieStore = await cookies()

  // 1. Inițializăm clientul Supabase pe Server cu acces la Cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
      },
    }
  )

  // 2. Extragem userul logat din sesiune (Supabase verifică automat token-ul din cookie)
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: 'You are not logged in. Please log in.' },
      { status: 401 }
    )
  }

  // 3. Interogăm tabelul `public.users`
  // Extragem DOAR coloanele cerute: display_name și avatar_url
  const { data: userData, error: dbError } = await supabase
    .from('users') // Numele tabelului tău din baza de date publică
    .select('display_name, avatar_url') // Selectăm doar ce avem nevoie
    .eq('id', user.id) // Filtrăm după ID-ul userului curent
    .single() // Așteptăm un singur rând ca răspuns

  if (dbError) {
    return NextResponse.json(
      { error: 'Eroare la preluarea datelor din baza de date', details: dbError.message },
      { status: 500 }
    )
  }

  // 4. Returnăm cu succes datele către client
  return NextResponse.json(userData)
}