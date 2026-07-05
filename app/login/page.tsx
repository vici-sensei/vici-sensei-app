'use client';

// 1. Schimbă importul din @supabase/supabase-js în @supabase/ssr
import { createBrowserClient } from '@supabase/ssr';
import { FcGoogle } from 'react-icons/fc';

// 2. Inițializează folosind createBrowserClient
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Această configurare combinată cu createBrowserClient va forța 
        // generarea unui flow PKCE (?code=...) în loc de hash (#access_token)
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d1117] px-4 text-white font-sans antialiased">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-zinc-700/50 bg-[#161b22] p-8 shadow-2xl">
        <div className="text-center">
          <span className="text-4xl inline-block drop-shadow-[0_0_8px_rgba(255,68,85,0.2)]">⛩️</span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Vici Sensei
          </h1>
          <p className="mt-3 text-sm font-medium text-zinc-400">
            Learn Japanese smartly with the SRS system
          </p>
        </div>

        <div className="mt-8">
          <button
            onClick={handleGoogleLogin}
            className="flex w-full items-center justify-center gap-3 rounded-full border border-[#ff4455]/60 bg-[#22141c] px-5 py-3.5 text-sm font-bold text-[#ff4455] tracking-wide transition-all duration-200 hover:bg-[#2f1a26] hover:border-[#ff4455] hover:shadow-[0_0_15px_rgba(255,68,85,0.2)] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-[#ff4455] focus:ring-offset-2 focus:ring-offset-[#161b22]"
          >
            <FcGoogle className="h-5 w-5 min-w-[20px] min-h-[20px]" />
            <span>Sign in with Google</span>
          </button>
        </div>
      </div>
    </div>
  );
}