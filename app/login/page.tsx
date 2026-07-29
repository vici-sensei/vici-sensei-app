"use client";

import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { FaToriiGate } from "react-icons/fa6";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";

type LoginState = "idle" | "loading" | "error";

export default function LoginPage() {
  const [state, setState] = useState<LoginState>("idle");

  async function handleGoogleLogin() {
    setState("loading");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setState("error");
    }
    // On success the browser navigates away to Google — no further state change needed.
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-[60px] text-center before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_20%,rgb(255_74_90/0.1)_0%,transparent_55%)]">
      <div className="relative w-full max-w-[460px]">
        <div className="mb-7 flex items-center justify-center gap-2.5 text-2xl font-extrabold tracking-[-0.5px]">
          <FaToriiGate className="h-[26px] w-[26px] text-accent-red" />
          Vici Sensei
        </div>
        <Badge>Spaced repetition, Anki style</Badge>
        <h1 className="mb-2 text-[2.6rem] font-extrabold leading-tight tracking-[-0.8px]">
          Learn Japanese
          <br />
          at your own pace.
        </h1>
        <p className="mb-10 text-base leading-[1.6] text-text-muted">
          Kanji, readings, and vocabulary organized by JLPT level, scheduled for exactly when your brain needs to
          see them again.
        </p>

        <Button
          type="button"
          className="w-full max-w-[360px]"
          loading={state === "loading"}
          onClick={handleGoogleLogin}
        >
          <FcGoogle className="h-5 w-5 shrink-0 rounded-full bg-white p-0.5" />
          Continue with Google
        </Button>

        <div
          className={`mt-[22px] items-center gap-2.5 rounded-xl border border-accent-red/30 bg-accent-red/[0.08] px-4 py-3.5 text-left text-[0.88rem] text-rose-200 ${
            state === "error" ? "flex" : "hidden"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[18px] w-[18px] shrink-0 text-accent-red">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Sign-in failed. Please try again.</span>
          <span className="ml-auto cursor-pointer whitespace-nowrap font-bold text-white underline underline-offset-2" onClick={handleGoogleLogin}>
            Retry
          </span>
        </div>

        <p className="mt-[18px] text-[0.85rem] text-text-muted">
          No passwords. Secure sign-in exclusively through your Google account.
        </p>
      </div>
    </div>
  );
}
