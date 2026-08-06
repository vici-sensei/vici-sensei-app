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
    const supabase = createClient();
    const next = searchParams.get("next") ?? "/dashboard";

    // detectSessionInUrl: true (set in lib/supabase/client.ts) makes the client exchange the
    // ?code= param for a session automatically — we just wait for the resulting SIGNED_IN event.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        router.replace(next);
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
