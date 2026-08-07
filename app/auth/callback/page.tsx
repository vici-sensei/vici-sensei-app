"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Supabase redirects back here with ?error=... (no ?code=) when it rejects the sign-in
    // server-side — e.g. our @gmail.com-only trigger blocking a non-gmail Google account.
    if (searchParams.get("error")) {
      router.replace("/login?error=auth_callback_failed");
      return;
    }

    const supabase = createClient();
    const next = searchParams.get("next") ?? "/dashboard";

    // A self-service email change (auth.updateUser({ email })) links a new "email"
    // identity alongside the existing Google one as a GoTrue side effect. We only
    // support Google sign-in, so drop it right after the change is confirmed.
    async function dropStrayEmailIdentity() {
      try {
        const { data } = await supabase.auth.getUserIdentities();
        const identities = data?.identities ?? [];
        const emailIdentity = identities.find((i) => i.provider === "email");
        if (emailIdentity && identities.some((i) => i.provider === "google")) {
          await supabase.auth.unlinkIdentity(emailIdentity);
        }
      } catch {
        // Best-effort cleanup; never block sign-in on it.
      }
    }

    // detectSessionInUrl: true (set in lib/supabase/client.ts) makes the client exchange the
    // ?code= param for a session automatically — we just wait for the resulting SIGNED_IN event.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        dropStrayEmailIdentity().finally(() => router.replace(next));
      }
    });

    // If there was never a code to exchange (bad/expired link), bail out instead of spinning forever.
    const timeout = setTimeout(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) setFailed(true);
      });
    }, 4000);

    return () => {
      subscription.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router, searchParams]);

  useEffect(() => {
    if (failed) router.replace("/login?error=auth_callback_failed");
  }, [failed, router]);

  return <FullScreenLoader />;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <AuthCallbackInner />
    </Suspense>
  );
}
