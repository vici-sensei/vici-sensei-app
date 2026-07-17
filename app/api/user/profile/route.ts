import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  // Extragem userul logat din sesiune (Supabase verifică automat token-ul din cookie)
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