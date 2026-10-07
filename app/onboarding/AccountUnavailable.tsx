"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FaTriangleExclamation } from "react-icons/fa6";
import { Button } from "@/app/components/ui/Button";
import { clearRememberedEmail } from "@/lib/auth/rememberedEmail";
import { createClient } from "@/lib/supabase/client";

/** Shown instead of the wizard when the signed-in session can't see any study settings of its own
 * and the account hasn't been moved to another region (see OnboardingLayout). The wizard could only
 * ever fail to save there, so the way out is a retry or a fresh login. */
export function AccountUnavailable() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    clearRememberedEmail();
    try {
      await createClient().auth.signOut();
    } catch {
      // even if the request fails, still send the user back to /login
    } finally {
      router.push("/login");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-[60px] text-center">
      <div className="w-full max-w-[440px]">
        <div className="mx-auto mb-5.5 flex h-16 w-16 items-center justify-center rounded-full border border-accent-red/30 bg-accent-red/10">
          <FaTriangleExclamation className="h-6.5 w-6.5 text-accent-red" />
        </div>
        <h1 className="mb-2.5 text-2xl font-extrabold">We can&apos;t load your account</h1>
        <p className="mb-7 text-base leading-[1.6] text-text-muted">
          This session can&apos;t see your account&apos;s data. That can happen after the account was moved to another
          region or scheduled for deletion on another device. Try again, or log out and sign in again.
        </p>
        <div className="flex items-center justify-center gap-2.5">
          <Button type="button" onClick={() => window.location.reload()} disabled={loggingOut}>
            Try again
          </Button>
          <Button type="button" variant="secondary" onClick={handleLogout} loading={loggingOut}>
            Log out
          </Button>
        </div>
      </div>
    </div>
  );
}
