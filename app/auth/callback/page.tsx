"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { switchGoogleAccount, cancelPendingAccountDeletion } from "@/lib/client-data/account";
import { ApiError } from "@/lib/api/client";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { useToast } from "@/app/components/ui/Toast";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // Supabase redirects back here with ?error=... (no ?code=) when it rejects the sign-in
    // or the linkIdentity() OAuth attempt server-side — e.g. the @gmail.com-only trigger
    // blocking a non-gmail Google account, or the account already being linked elsewhere
    // (?error=server_error&error_code=identity_already_exists&error_description=...).
    // error_code is the specific, stable machine-readable value — prefer it over the
    // generic top-level `error` bucket and the (less predictable) human description.
    // A switch attempt happens while already authenticated, so route its failures back to
    // Settings instead of bouncing an already-logged-in user out to /login.
    const errorCodeParam = searchParams.get("error_code");
    const errorDescription = searchParams.get("error_description");
    const errorCode = errorCodeParam ?? errorDescription ?? searchParams.get("error");
    if (errorCode) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          // GoTrue reuses identity_already_exists for two different situations, distinguishable
          // only by error_description: re-picking the Google account you already have linked
          // ("Identity is already linked") vs one already linked to a different Supabase user
          // ("Identity is already linked to another user"). Surface the former as its own code
          // so Settings can show "you're already using that account" instead of a false
          // "used by another profile" warning.
          const isOwnIdentity =
            errorCodeParam === "identity_already_exists" &&
            !!errorDescription &&
            !errorDescription.toLowerCase().includes("another user");
          const switchError = isOwnIdentity ? "identity_already_own_account" : errorCode;
          router.replace(`/settings/profile?switchError=${encodeURIComponent(switchError)}`);
        } else {
          router.replace("/login?error=auth_callback_failed");
        }
      });
      return;
    }

    const next = searchParams.get("next") ?? "/dashboard";
    const isSwitch = searchParams.get("switch") === "1";

    // A self-service email change (the old manual "change email" flow) used to link a new
    // "email" identity alongside the existing Google one as a GoTrue side effect. We only
    // support Google sign-in, so drop it if it's ever still present.
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

    // Finishes a "Switch Google account" attempt: the freshly-linked Google identity (the
    // one with the latest created_at) becomes the account's email via the Edge Function
    // (bypassing the normal confirmation-email flow, since Google OAuth already proved
    // ownership), then the previous Google identity is unlinked so it's no longer associated.
    async function completeGoogleAccountSwitch(): Promise<{ ok: true } | { ok: false; code: string }> {
      const { data } = await supabase.auth.getUserIdentities();
      const googleIdentities = (data?.identities ?? [])
        .filter((i) => i.provider === "google")
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

      if (googleIdentities.length < 2) {
        return { ok: false, code: "no_new_account" };
      }

      const [newest, ...rest] = googleIdentities;
      try {
        await switchGoogleAccount(newest.identity_id);
      } catch (err) {
        // Leave both identities linked — safe fallback state, nothing broken, can retry.
        return { ok: false, code: err instanceof ApiError ? err.message : "update_failed" };
      }

      // Best-effort: the email switch already succeeded, so this is just cleanup.
      await Promise.allSettled(rest.map((identity) => supabase.auth.unlinkIdentity(identity)));
      return { ok: true };
    }

    // detectSessionInUrl: true (set in lib/supabase/client.ts) makes the client exchange the
    // ?code= param for a session automatically — we just wait for the resulting session. This
    // isn't guaranteed to be a SIGNED_IN event for a linkIdentity() return, so any event that
    // carries a session is treated as "ready". Guarded so a second event (e.g. a subsequent
    // TOKEN_REFRESHED) can't re-run the switch/redirect logic.
    let handled = false;
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session || handled) return;
      handled = true;

      async function finish() {
        if (isSwitch) {
          const result = await completeGoogleAccountSwitch();
          // admin.updateUserById({ email }) has the same GoTrue side effect as the old
          // self-service email change: it links a stray "email" identity. Drop it after
          // the switch (successful or not) rather than before, since it doesn't exist yet
          // at the start of this flow.
          await dropStrayEmailIdentity();
          if (!result.ok) {
            router.replace(`/settings/profile?switchError=${encodeURIComponent(result.code)}`);
            return;
          }
          router.replace("/settings/profile?switched=1");
          return;
        }
        await dropStrayEmailIdentity();
        // Best-effort: if this account had requested deletion, logging back in
        // cancels it. cancelPendingAccountDeletion() never throws.
        const reactivated = await cancelPendingAccountDeletion();
        if (reactivated) {
          showToast("Welcome back — your account was reactivated!", "success");
        }
        router.replace(next);
      }

      finish();
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
  }, [router, searchParams, showToast]);

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
