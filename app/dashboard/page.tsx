import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Image from 'next/image'

export default async function DashboardPage() {
  const cookieStore = await cookies()

  // 1. Inițializăm clientul Supabase pe Server pentru a citi sesiunea
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

  // 2. Verificăm dacă userul este autentificat
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  // Dacă nu este logat, îl trimitem forțat înapoi la login
  if (authError || !user) {
    redirect('/login')
  }

  // 3. Extragem display_name și avatar_url din tabelul public.users
  const { data: dbUser, error: dbError } = await supabase
    .from('users')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .single() // Vrem un singur obiect, nu un array

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d1117] px-4 text-white font-sans antialiased">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-zinc-700/50 bg-[#161b22] p-8 text-center shadow-2xl">
        
        <span className="text-4xl inline-block drop-shadow-[0_0_8px_rgba(255,68,85,0.2)]">⛩️</span>
        
        <h1 className="text-2xl font-extrabold tracking-tight text-white">
          Dashboard
        </h1>

        <div className="flex flex-col items-center gap-4 rounded-xl bg-[#22141c] border border-[#ff4455]/30 p-6">
          {dbUser?.avatar_url && (
            <img
              src={dbUser.avatar_url}
              alt="Avatar"
              className="h-16 w-16 rounded-full border-2 border-[#ff4455]"
            />
          )}
          
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">User logged in:</p>
            <h2 className="text-xl font-bold text-[#ff4455]">
              {dbUser?.display_name || 'Incert / Fără nume'}
            </h2>
          </div>
        </div>
      </div>
    </div>
  )
}