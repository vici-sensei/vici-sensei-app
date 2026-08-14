"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FcGoogle } from "react-icons/fc";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useToast } from "@/app/components/ui/Toast";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { Logo } from "@/app/components/ui/Logo";

function LoginErrorNotice() {
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  useEffect(() => {
    if (searchParams.get("error")) {
      showToast("Couldn't sign you in. Only @gmail.com Google accounts are supported.", "error");
    }
  }, [searchParams, showToast]);

  return null;
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authed") router.replace("/dashboard");
  }, [status, router]);

  async function handleGoogleLogin() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
          // Best-effort hint to Google's account chooser — not a real guarantee,
          // the @gmail.com requirement is enforced in the database.
          hd: "gmail.com",
        },
      },
    });

    if (error) {
      setLoading(false);
      showToast("Sign-in failed. Please try again.", "error");
    }
    // On success the browser navigates away to Google — no further state change needed.
  }

  if (status !== "anon") return <FullScreenLoader />;

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-y-auto px-6 py-6 text-center before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_20%,rgb(255_74_90/0.1)_0%,transparent_55%)]">
      <Suspense fallback={null}>
        <LoginErrorNotice />
      </Suspense>
      <div className="relative w-full max-w-[460px]">
        <Logo size={112} className="mx-auto mb-[clamp(1.75rem,4dvh,4rem)]" />
        <Badge className="mb-[clamp(0.75rem,2.5dvh,2.5rem)]">Spaced repetition, Anki style</Badge>
        <h1 className="mb-[clamp(0.5rem,1.5dvh,1.75rem)] text-[2.6rem] font-extrabold leading-tight tracking-[-0.8px]">
          Learn Japanese
          <br />
          at your own pace.
        </h1>
        <p className="mb-[clamp(2.5rem,6dvh,5.5rem)] text-base leading-[1.6] text-text-muted">
          Kanji, readings, and vocabulary organized by JLPT level, scheduled for exactly when your brain needs to
          see them again.
        </p>

        <Button
          type="button"
          className="w-full max-w-[360px]"
          loading={loading}
          onClick={handleGoogleLogin}
        >
          <FcGoogle className="h-5 w-5 shrink-0 rounded-full bg-white p-0.5" />
          Continue with Google
        </Button>
      </div>
    </div>
  );
}
