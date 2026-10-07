"use client";

import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { createClient } from "@/lib/supabase/client";
import { useOnPageRestored } from "@/lib/useOnPageRestored";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";

/** "Continue with Google" -- the same OAuth round trip whether the person is logging in or signing
 * up (Supabase creates the account on first use), so /login and /signup share this button. */
export function GoogleButton({ disabled }: { disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  // Back from Google's account chooser restores the page from bfcache with `loading` still true.
  useOnPageRestored(() => setLoading(false));

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
          // the @gmail.com requirement is enforced in the database (on the Google identity).
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

  return (
    <div className="flex justify-center">
      <Button
        type="button"
        className="w-full max-w-[360px]"
        loading={loading}
        disabled={disabled}
        loadingIconPosition="right"
        onClick={handleGoogleLogin}
      >
        <FcGoogle className="h-5 w-5 shrink-0 rounded-full bg-white p-0.5" />
        Continue with Google
      </Button>
    </div>
  );
}
