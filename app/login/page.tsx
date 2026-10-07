"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/app/components/ui/Toast";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { AuthLayout, OrDivider } from "@/app/components/auth/AuthLayout";
import { AuthForm } from "@/app/components/auth/AuthForm";
import { EmailField, PasswordFormField } from "@/app/components/auth/AuthFields";
import { GoogleButton } from "@/app/components/auth/GoogleButton";
import { RegionPicker } from "@/app/components/auth/RegionPicker";
import { useTurnstile } from "@/app/components/auth/Turnstile";
import { finishSignIn } from "@/lib/auth/finishSignIn";
import {
  isPasswordAuthEnabled,
  looksLikeEmail,
  rememberPendingAuth,
  signInWithPasswordAcrossRegions,
} from "@/lib/auth/passwordAuth";
import { useAuthRegion } from "@/lib/auth/useAuthRegion";
import { useAuthSubmit } from "@/lib/auth/useAuthSubmit";
import { useRedirectIfAuthed } from "@/lib/auth/useRedirectIfAuthed";
import { useRememberedEmail } from "@/lib/auth/useRememberedEmail";
import { isRegion, setActiveRegion, type Region } from "@/lib/supabase/regions";

function LoginErrorNotice({ onWrongRegion }: { onWrongRegion: (region: Region) => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  useEffect(() => {
    const error = searchParams.get("error");
    if (!error) return;
    // Consume the ?error param immediately: onWrongRegion/showToast are new references on
    // every LoginPage re-render (e.g. the geo-IP effect resolving), which would otherwise
    // re-run this effect and re-show the toast indefinitely as long as the param lingers.
    router.replace("/login", { scroll: false });
    if (error === "wrong_region") {
      // Set by app/auth/callback/page.tsx when the multi-region "Before User Created" hook
      // rejects a signup whose email already belongs to the other region (also by /signup).
      const regionParam = searchParams.get("region");
      if (isRegion(regionParam)) onWrongRegion(regionParam);
      showToast(
        regionParam
          ? `Your account is registered in the ${regionParam.toUpperCase()} region. Retrying from there.`
          : "Your account is registered in a different region. Please try again from there.",
        "info"
      );
      return;
    }
    if (error === "account_moved") {
      // Set by app/auth/callback/page.tsx when check_account_moved() finds this account was
      // self-service moved to the other region (Settings -> Server region) -- logging into the
      // OLD region again (stale bookmark, another device) must not look like a normal failure,
      // and must point the picker at the region their data actually lives in now.
      const regionParam = searchParams.get("region");
      if (isRegion(regionParam)) onWrongRegion(regionParam);
      showToast(
        regionParam
          ? `Your account has moved to the ${regionParam.toUpperCase()} region. Please sign in from there.`
          : "Your account has moved to a different region. Please sign in from there.",
        "info"
      );
      return;
    }
    if (error === "password_reset_expired") {
      showToast("That reset link has expired. Request a new one.", "info");
      return;
    }
    showToast("Couldn't sign you in. Only @gmail.com Google accounts are supported.", "error");
  }, [searchParams, showToast, onWrongRegion, router]);

  return null;
}

/** Email + password form, shown only behind NEXT_PUBLIC_PASSWORD_AUTH. */
function PasswordLoginForm({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [email, setEmail] = useRememberedEmail();
  const [password, setPassword] = useState("");
  const { submitting, failure, setFailure, submit } = useAuthSubmit();
  // The security card only slides in once there is something to submit.
  const formComplete = looksLikeEmail(email) && password.length > 0;
  const captcha = useTurnstile(formComplete);

  // The page's "already signed in -> /dashboard" redirect must not fire between the session
  // appearing and finishSignIn() below deciding whether this account may continue. It also has to
  // be lifted again when Back restores this form from bfcache (useAuthSubmit resets `submitting`).
  useEffect(() => {
    onBusyChange(submitting);
  }, [submitting, onBusyChange]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!looksLikeEmail(email) || password.length === 0) {
      setFailure({ code: "invalid_credentials", message: "Enter your email and password." });
      return;
    }

    const result = await submit(() => signInWithPasswordAcrossRegions(email, password, captcha.getToken), {
      onFailure: (failure) => {
        if (failure.code !== "email_not_confirmed") return false;
        rememberPendingAuth({ email: email.trim().toLowerCase(), kind: "email" });
        router.push("/auth/confirm?type=email");
        return true;
      },
    });
    if (!result) return;

    const finished = await finishSignIn();
    if (finished.kind === "moved") {
      window.location.assign(`/login?error=account_moved&region=${finished.region}`);
      return;
    }
    if (finished.reactivated) showToast("Welcome back — your account was reactivated!", "success");
    // A full load, not router.replace: AuthProvider is bound to the region that was active when
    // it mounted, which is wrong whenever the account turned out to live in the other one.
    window.location.assign("/dashboard");
  }

  return (
    <AuthForm
      onSubmit={handleSubmit}
      className="mx-auto w-full max-w-[360px] gap-4"
      submitting={submitting}
      failure={failure}
      captcha={captcha}
      submitLabel="Log in"
      submitVariant="secondary"
      submitDisabled={!formComplete}
    >
      <EmailField id="login-email" value={email} onChange={setEmail} />
      <PasswordFormField
        id="login-password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
        labelAside={
          <Link href="/forgot-password" className="text-[0.8rem] font-semibold text-accent-blue hover:underline">
            Forgot password?
          </Link>
        }
      />
    </AuthForm>
  );
}

export default function LoginPage() {
  const [region, setRegion] = useAuthRegion();
  const [busy, setBusy] = useState(false);
  const status = useRedirectIfAuthed(busy);
  const passwordAuth = isPasswordAuthEnabled();

  if (status !== "anon" && !busy) return <FullScreenLoader />;

  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <LoginErrorNotice
          onWrongRegion={(correctRegion) => {
            setActiveRegion(correctRegion);
            setRegion(correctRegion);
          }}
        />
      </Suspense>
      {region && <RegionPicker region={region} />}

      <GoogleButton />

      {passwordAuth && (
        <>
          <OrDivider />
          <PasswordLoginForm onBusyChange={setBusy} />
          <p className="mt-6 text-center text-[0.9rem] text-text-muted">
            New here?{" "}
            <Link href="/signup" className="font-bold text-accent-blue hover:underline">
              Create an account
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}
